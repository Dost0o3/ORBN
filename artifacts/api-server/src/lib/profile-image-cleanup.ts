import { runNormalizeProfileImages } from "@workspace/profile-image-normalizer";
import { db, profileImageCleanupRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * How often the recurring profile-image normalization sweep runs.
 *
 * The web uploader already crops + re-encodes client-side, so on a steady
 * state most assets short-circuit at the "already JPEG and at/under target
 * dimensions" idempotency check. The sweep is here to catch legacy uploads,
 * bulk imports, seeds, and any future client regressions — daily is plenty.
 */
export const PROFILE_IMAGE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Start the recurring profile-image normalization sweep.
 *
 * Fires once on startup (so freshly-restarted servers don't have to wait a
 * full interval before the first sweep) and then every `intervalMs`. Re-runs
 * are safe — the underlying normalizer is idempotent (already-JPEG assets at
 * or under target dimensions short-circuit immediately) and the `running`
 * flag below guards against overlapping ticks if a sweep ever takes longer
 * than the interval.
 */
export function startProfileImagesCleanupJob(
  intervalMs: number = PROFILE_IMAGE_CLEANUP_INTERVAL_MS,
): () => void {
  const tick = async () => {
    // Guard against overlapping runs if a sweep takes longer than the interval.
    if (running) {
      logger.warn(
        { job: "profile-image-cleanup" },
        "Skipping profile image cleanup — previous run still in progress",
      );
      return;
    }
    running = true;
    const startedAt = Date.now();
    // Persist a "running" row immediately so partial/crashed runs are
    // visible in the audit log instead of disappearing. We update it in
    // place on completion. Failure to insert the audit row must NOT
    // block the actual sweep — the structured log line is still the
    // source of truth.
    let runId: number | null = null;
    try {
      const inserted = await db
        .insert(profileImageCleanupRunsTable)
        .values({ status: "running" })
        .returning({ id: profileImageCleanupRunsTable.id });
      runId = inserted[0]?.id ?? null;
    } catch (auditErr) {
      logger.warn(
        { err: auditErr, job: "profile-image-cleanup" },
        "Failed to insert cleanup audit row — continuing sweep without it",
      );
    }
    try {
      const totals = await runNormalizeProfileImages();
      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          job: "profile-image-cleanup",
          usersScanned: totals.usersScanned,
          communitiesScanned: totals.communitiesScanned,
          rewritten: totals.rewritten,
          skippedAlreadyNormalized: totals.skippedAlreadyNormalized,
          skippedExternal: totals.skippedExternal,
          skippedMissing: totals.skippedMissing,
          failed: totals.failed,
          bytesBefore: totals.bytesBefore,
          bytesAfter: totals.bytesAfter,
          durationMs,
        },
        totals.rewritten > 0
          ? "Profile images normalized"
          : "Profile image cleanup ran — nothing to rewrite",
      );
      if (runId !== null) {
        try {
          await db
            .update(profileImageCleanupRunsTable)
            .set({
              finishedAt: new Date(),
              status: "success",
              durationMs,
              totals,
            })
            .where(eq(profileImageCleanupRunsTable.id, runId));
        } catch (auditErr) {
          logger.warn(
            { err: auditErr, runId, job: "profile-image-cleanup" },
            "Failed to finalize cleanup audit row",
          );
        }
      }
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      logger.error(
        { err, job: "profile-image-cleanup" },
        "Profile image cleanup failed",
      );
      if (runId !== null) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await db
            .update(profileImageCleanupRunsTable)
            .set({
              finishedAt: new Date(),
              status: "failed",
              durationMs,
              errorMessage: message.slice(0, 1024),
            })
            .where(eq(profileImageCleanupRunsTable.id, runId));
        } catch (auditErr) {
          logger.warn(
            { err: auditErr, runId, job: "profile-image-cleanup" },
            "Failed to record cleanup failure in audit row",
          );
        }
      }
    } finally {
      running = false;
    }
  };

  // Fire once on startup so freshly-restarted servers don't have to wait a
  // full interval before the first sweep.
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
