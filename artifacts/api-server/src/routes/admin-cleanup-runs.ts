import { Router } from "express";
import {
  db,
  profileImageCleanupRunsTable,
  directMessageCleanupRunsTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { ensureUser } from "./users";

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Admin-only: list the most recent profile-image cleanup runs.
 *
 * Backed by `profile_image_cleanup_runs`, written by the recurring sweep
 * in `lib/profile-image-cleanup.ts`. Used by operators to confirm the
 * sweep is healthy and quantify storage savings over time.
 */
router.get("/admin/profile-image-cleanup/runs", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);
  if (!me.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rawLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rows = await db
    .select()
    .from(profileImageCleanupRunsTable)
    .orderBy(desc(profileImageCleanupRunsTable.startedAt))
    .limit(limit);

  res.json({
    runs: rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      status: r.status,
      durationMs: r.durationMs,
      totals: r.totals,
      errorMessage: r.errorMessage,
    })),
  });
});

/**
 * Admin-only: list the most recent direct-message cleanup runs.
 *
 * Backed by `direct_message_cleanup_runs`, written by the recurring
 * sweep in `lib/dm-cleanup.ts`. Used by operators to confirm the sweep
 * is healthy and quantify how many expired DMs are being purged.
 */
router.get("/admin/direct-message-cleanup/runs", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);
  if (!me.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rawLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rows = await db
    .select()
    .from(directMessageCleanupRunsTable)
    .orderBy(desc(directMessageCleanupRunsTable.startedAt))
    .limit(limit);

  res.json({
    runs: rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      status: r.status,
      durationMs: r.durationMs,
      totals: r.totals,
      errorMessage: r.errorMessage,
    })),
  });
});

export default router;
