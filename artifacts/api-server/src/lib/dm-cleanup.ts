import {
  db,
  directConversationsTable,
  directMessagesTable,
  directMessageCleanupRunsTable,
} from "@workspace/db";
import { and, eq, lt, gt, isNull, isNotNull, or, sql, desc, inArray } from "drizzle-orm";
import { logger } from "./logger";

export const DM_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

const notExpiredFilter = or(
  isNull(directMessagesTable.expiresAt),
  gt(directMessagesTable.expiresAt, sql`now()`),
);

/**
 * Permanently delete direct messages whose self-destruct TTL has elapsed,
 * and recompute `lastMessageAt` for any conversation whose most recent
 * surviving message changed as a result.
 */
export async function runExpiredDirectMessagesCleanup(): Promise<{
  deletedCount: number;
  conversationsUpdated: number;
}> {
  const deleted = await db
    .delete(directMessagesTable)
    .where(
      and(
        isNotNull(directMessagesTable.expiresAt),
        lt(directMessagesTable.expiresAt, sql`now()`),
      ),
    )
    .returning({ conversationId: directMessagesTable.conversationId });

  if (deleted.length === 0) {
    return { deletedCount: 0, conversationsUpdated: 0 };
  }

  const affectedConvIds = Array.from(
    new Set(deleted.map((r) => r.conversationId)),
  );

  const convs = await db
    .select({
      id: directConversationsTable.id,
      createdAt: directConversationsTable.createdAt,
      lastMessageAt: directConversationsTable.lastMessageAt,
    })
    .from(directConversationsTable)
    .where(inArray(directConversationsTable.id, affectedConvIds));

  let conversationsUpdated = 0;
  for (const conv of convs) {
    const [latest] = await db
      .select({ createdAt: directMessagesTable.createdAt })
      .from(directMessagesTable)
      .where(
        and(
          eq(directMessagesTable.conversationId, conv.id),
          notExpiredFilter,
        ),
      )
      .orderBy(desc(directMessagesTable.createdAt))
      .limit(1);

    const newLastMessageAt = latest?.createdAt ?? conv.createdAt;
    if (newLastMessageAt.getTime() !== conv.lastMessageAt.getTime()) {
      // Conditional WHERE guards against a race where a brand-new DM is
      // inserted between our SELECT and UPDATE — in that case we'd otherwise
      // clobber a newer `lastMessageAt` with an older value.
      const updated = await db
        .update(directConversationsTable)
        .set({ lastMessageAt: newLastMessageAt })
        .where(
          and(
            eq(directConversationsTable.id, conv.id),
            eq(directConversationsTable.lastMessageAt, conv.lastMessageAt),
          ),
        )
        .returning({ id: directConversationsTable.id });
      if (updated.length > 0) conversationsUpdated += 1;
    }
  }

  return { deletedCount: deleted.length, conversationsUpdated };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export interface StartDirectMessagesCleanupJobOptions {
  /**
   * Override the sweep implementation. Defaults to
   * `runExpiredDirectMessagesCleanup`. Exposed for tests so they can drive
   * the scheduling wrapper without touching the database.
   */
  sweep?: () => Promise<{ deletedCount: number; conversationsUpdated: number }>;
}

export function startDirectMessagesCleanupJob(
  intervalMs: number = DM_CLEANUP_INTERVAL_MS,
  options: StartDirectMessagesCleanupJobOptions = {},
): () => void {
  const sweep = options.sweep ?? runExpiredDirectMessagesCleanup;
  const tick = async () => {
    // Guard against overlapping runs if a sweep takes longer than the interval.
    if (running) {
      logger.warn(
        { job: "dm-cleanup" },
        "Skipping direct message cleanup — previous run still in progress",
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
        .insert(directMessageCleanupRunsTable)
        .values({ status: "running" })
        .returning({ id: directMessageCleanupRunsTable.id });
      runId = inserted[0]?.id ?? null;
    } catch (auditErr) {
      logger.warn(
        { err: auditErr, job: "dm-cleanup" },
        "Failed to insert cleanup audit row — continuing sweep without it",
      );
    }
    try {
      const result = await sweep();
      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          job: "dm-cleanup",
          deletedCount: result.deletedCount,
          conversationsUpdated: result.conversationsUpdated,
          durationMs,
        },
        result.deletedCount > 0
          ? "Expired direct messages cleaned up"
          : "Direct message cleanup ran — nothing to delete",
      );
      if (runId !== null) {
        try {
          await db
            .update(directMessageCleanupRunsTable)
            .set({
              finishedAt: new Date(),
              status: "success",
              durationMs,
              totals: result,
            })
            .where(eq(directMessageCleanupRunsTable.id, runId));
        } catch (auditErr) {
          logger.warn(
            { err: auditErr, runId, job: "dm-cleanup" },
            "Failed to finalize cleanup audit row",
          );
        }
      }
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      logger.error({ err, job: "dm-cleanup" }, "Direct message cleanup failed");
      if (runId !== null) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await db
            .update(directMessageCleanupRunsTable)
            .set({
              finishedAt: new Date(),
              status: "failed",
              durationMs,
              errorMessage: message.slice(0, 1024),
            })
            .where(eq(directMessageCleanupRunsTable.id, runId));
        } catch (auditErr) {
          logger.warn(
            { err: auditErr, runId, job: "dm-cleanup" },
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
