import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

/**
 * Audit log of every scheduled direct-message cleanup sweep.
 *
 * Mirrors `profile_image_cleanup_runs`: the sweep itself
 * (lib/dm-cleanup.ts) writes an initial "running" row at start, then
 * UPDATEs it with `finishedAt`, `status`, totals, and either
 * `errorMessage` (on failure) at completion. An admin-only endpoint
 * reads the most recent rows so operators can confirm the sweep is
 * healthy and quantify how many expired DMs are being purged over time.
 */
export const directMessageCleanupRunsTable = pgTable("direct_message_cleanup_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  /** "running" | "success" | "failed" */
  status: text("status").notNull().default("running"),
  /** Wall-clock duration of the run in milliseconds. NULL while running. */
  durationMs: integer("duration_ms"),
  /**
   * Per-run totals. Shape mirrors `runExpiredDirectMessagesCleanup()`
   * output — stored as JSONB so we can extend the totals without a
   * migration. Includes: deletedCount, conversationsUpdated.
   */
  totals: jsonb("totals"),
  /** Populated only on `status = "failed"`. Truncated to 1KB at write. */
  errorMessage: text("error_message"),
});

export type DirectMessageCleanupRun = typeof directMessageCleanupRunsTable.$inferSelect;
