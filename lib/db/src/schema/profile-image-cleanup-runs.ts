import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

/**
 * Audit log of every scheduled profile-image normalization sweep.
 *
 * The sweep itself (lib/profile-image-cleanup.ts) only logs to the
 * structured logger today, which makes long-term auditing and storage-
 * savings reporting difficult — deployment logs roll over. Each tick
 * records one row here: an initial "running" insert at start, then an
 * UPDATE with `finishedAt`, `status`, totals, and either `errorMessage`
 * (on failure) at completion. An admin-only endpoint reads the most
 * recent rows.
 */
export const profileImageCleanupRunsTable = pgTable("profile_image_cleanup_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  /** "running" | "success" | "failed" */
  status: text("status").notNull().default("running"),
  /** Wall-clock duration of the run in milliseconds. NULL while running. */
  durationMs: integer("duration_ms"),
  /**
   * Per-run totals. Shape mirrors `runNormalizeProfileImages()` output —
   * stored as JSONB so we can extend the totals without a migration.
   * Includes: usersScanned, communitiesScanned, rewritten,
   * skippedAlreadyNormalized, skippedExternal, skippedMissing, failed,
   * bytesBefore, bytesAfter.
   */
  totals: jsonb("totals"),
  /** Populated only on `status = "failed"`. Truncated to 1KB at write. */
  errorMessage: text("error_message"),
});

export type ProfileImageCleanupRun = typeof profileImageCleanupRunsTable.$inferSelect;
