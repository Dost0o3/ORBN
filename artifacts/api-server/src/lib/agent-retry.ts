import { db, soulTwinActionsTable } from "@workspace/db";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { logger } from "./logger";
import { executeApprovedAction, isAgentActionErrorCode, MAX_ATTEMPTS, RETRY_BACKOFF_MS, RETRYABLE_ERROR_CODES } from "./agent-actions";

/**
 * How often the background retry sweep runs. Tuned so a transient blip
 * (1m backoff) gets a fresh attempt within ~one tick.
 */
export const AGENT_RETRY_INTERVAL_MS = 60_000;

/**
 * Cap the number of rows examined per sweep so a backlog after a long
 * outage can't pin the event loop. Excess rows naturally roll into the
 * next tick.
 */
const SWEEP_BATCH_SIZE = 100;

export interface AgentRetrySweepResult {
  /** Rows that matched the SQL pre-filter (before per-attempt backoff). */
  candidateCount: number;
  /** Rows that passed the per-attempt backoff and were re-executed. */
  retriedCount: number;
  /** Re-executions whose side effect succeeded (executedAt now set). */
  succeededCount: number;
  /** Re-executions that failed but still had retry budget remaining. */
  failedCount: number;
  /** Re-executions that failed and exhausted MAX_ATTEMPTS (status flipped to "failed"). */
  gaveUpCount: number;
}

/**
 * Find approved-but-unexecuted action rows whose previous attempt is at
 * least the minimum backoff old, then re-run each via
 * `executeApprovedAction`. The catch branch in that helper handles
 * incrementing attemptCount, capturing lastError, and flipping status to
 * "failed" once the retry budget is exhausted — so this sweep is
 * intentionally a thin scheduler, not a state machine of its own.
 */
export async function runAgentRetrySweep(): Promise<AgentRetrySweepResult> {
  const minBackoffMs = RETRY_BACKOFF_MS[0] ?? 60_000;
  // Pre-filter in SQL: any approved + unexecuted row that hasn't already
  // exhausted the cap, AND whose most recent activity (lastAttemptAt if
  // we have it, otherwise resolvedAt — the moment it became eligible to
  // run — otherwise the row's createdAt) is at least the minimum backoff
  // old. Using COALESCE means legacy pre-migration rows (lastAttemptAt
  // IS NULL) and rows whose initial maybeAutoExecute crashed before
  // stamping an attempt are both swept up by the same query, so the
  // user doesn't have to manually un-stick them.
  const candidates = await db
    .select()
    .from(soulTwinActionsTable)
    .where(and(
      eq(soulTwinActionsTable.status, "approved"),
      isNull(soulTwinActionsTable.executedAt),
      lt(soulTwinActionsTable.attemptCount, MAX_ATTEMPTS),
      sql`COALESCE(${soulTwinActionsTable.lastAttemptAt}, ${soulTwinActionsTable.resolvedAt}, ${soulTwinActionsTable.createdAt}) < now() - (${minBackoffMs} || ' milliseconds')::interval`,
    ))
    // Oldest-eligible-first so a sustained backlog (after, say, an
    // OpenAI outage) drains in FIFO order rather than starving the
    // earliest stuck rows behind whatever the row order happens to be.
    .orderBy(asc(sql`COALESCE(${soulTwinActionsTable.lastAttemptAt}, ${soulTwinActionsTable.resolvedAt}, ${soulTwinActionsTable.createdAt})`))
    .limit(SWEEP_BATCH_SIZE);

  let retriedCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let gaveUpCount = 0;

  for (const row of candidates) {
    // attemptCount is the number of past attempts. The wait time before
    // the next attempt is RETRY_BACKOFF_MS[attemptCount - 1] (the FIRST
    // entry is the wait between attempt 1 and attempt 2). For never-tried
    // rows (attemptCount=0, e.g. legacy rows or rows whose first
    // maybeAutoExecute crashed before stamping an attempt) there is no
    // prior attempt to back off from — the SQL `min backoff` age check
    // is the only gate, so use the minimum backoff here too.
    const requiredBackoffMs = row.attemptCount === 0
      ? minBackoffMs
      : (RETRY_BACKOFF_MS[Math.min(row.attemptCount - 1, RETRY_BACKOFF_MS.length - 1)] ?? minBackoffMs);
    const referenceTime = row.lastAttemptAt ?? row.resolvedAt ?? row.createdAt;
    const sinceLastMs = referenceTime ? Date.now() - referenceTime.getTime() : Infinity;
    if (sinceLastMs < requiredBackoffMs) continue;

    // Permanent-coded rows (recipient_blocked, content_rejected, …) will
    // never succeed on a future attempt. Flip them to status="failed"
    // here — without burning another execution attempt — so the History
    // tab renders "Gave up" and the row stops being a sweep candidate.
    // The UI's Retry-button gating hides the button as soon as the
    // permanent code is set, so users never see a misleading Retry on
    // these rows in the meantime.
    //
    // The column is plain text (not a PG enum), so we validate the
    // stored value against the known union before deciding. Unknown
    // values — legacy pre-Task-#41 rows (lastErrorCode IS NULL) and any
    // future code a stale deployed binary doesn't recognise — fall
    // through to the normal retry path: the safer default is to keep
    // retrying than to permanently lock a row out based on a value we
    // can't interpret.
    if (isAgentActionErrorCode(row.lastErrorCode) && !RETRYABLE_ERROR_CODES.has(row.lastErrorCode)) {
      await db
        .update(soulTwinActionsTable)
        .set({ status: "failed" })
        .where(eq(soulTwinActionsTable.id, row.id))
        .catch(() => {});
      gaveUpCount += 1;
      continue;
    }

    retriedCount += 1;
    try {
      const r = await executeApprovedAction(row);
      if (r.claimedByCaller && r.action.executedAt) {
        succeededCount += 1;
      } else {
        // Lost the atomic claim race (some other caller executed between
        // our SELECT and the claim UPDATE). Counts as neither success
        // nor failure for our metrics — the row is in its post-race
        // authoritative state.
      }
    } catch {
      // executeApprovedAction's catch branch already persisted the new
      // attemptCount/lastError and (if applicable) flipped status to
      // "failed". Re-fetch to classify the row for our metrics.
      const latest = await db.query.soulTwinActionsTable.findFirst({
        where: eq(soulTwinActionsTable.id, row.id),
      });
      if (latest?.status === "failed") gaveUpCount += 1;
      else failedCount += 1;
    }
  }

  return {
    candidateCount: candidates.length,
    retriedCount,
    succeededCount,
    failedCount,
    gaveUpCount,
  };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Start the periodic retry sweep. Mirrors `startDirectMessagesCleanupJob`'s
 * shape: fires once on startup, then every `intervalMs`, with overlap
 * guarding so a slow sweep doesn't race the next tick.
 */
export function startAgentRetryWorker(
  intervalMs: number = AGENT_RETRY_INTERVAL_MS,
): () => void {
  const tick = async () => {
    if (running) {
      logger.warn(
        { job: "agent-retry" },
        "Skipping agent retry sweep — previous run still in progress",
      );
      return;
    }
    running = true;
    const startedAt = Date.now();
    try {
      const result = await runAgentRetrySweep();
      // Only log when we actually did work, otherwise this is just noise
      // every minute.
      if (result.retriedCount > 0 || result.candidateCount > 0) {
        logger.info(
          { job: "agent-retry", durationMs: Date.now() - startedAt, ...result },
          "Agent retry sweep complete",
        );
      }
    } catch (err) {
      logger.error({ err, job: "agent-retry" }, "Agent retry sweep failed");
    } finally {
      running = false;
    }
  };
  void tick();
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
