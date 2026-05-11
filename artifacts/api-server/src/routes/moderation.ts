import { Router } from "express";
import { db } from "@workspace/db";
import {
  directBlocksTable,
  directConversationsTable,
  directMessagesTable,
  notificationsTable,
  userReportsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ReportUserBody,
  ListUserReportsQueryParams,
  UpdateUserReportStatusParams,
  UpdateUserReportStatusBody,
  GetUserReportConversationParams,
  GetUserReportConversationQueryParams,
  SetUserVerificationTierParams,
  SetUserVerificationTierBody,
  ListAdminUsersQueryParams,
  SetUserAdminParams,
  SetUserAdminBody,
} from "@workspace/api-zod";
import { ensureUser, buildUserProfile } from "./users";

const router = Router();

const REPORT_STATUSES = ["pending", "reviewed", "dismissed", "actioned"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

router.post("/users/:userId/block", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);
  const targetId = req.params.userId;
  if (targetId === me.id) {
    res.status(400).json({ error: "Cannot block yourself" });
    return;
  }
  const target = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, targetId),
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await db
    .insert(directBlocksTable)
    .values({ blockerId: me.id, blockedId: targetId })
    .onConflictDoNothing({
      target: [directBlocksTable.blockerId, directBlocksTable.blockedId],
    });
  res.status(204).end();
});

router.delete("/users/:userId/block", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);
  await db
    .delete(directBlocksTable)
    .where(
      and(
        eq(directBlocksTable.blockerId, me.id),
        eq(directBlocksTable.blockedId, req.params.userId),
      ),
    );
  res.status(204).end();
});

router.post("/users/:userId/report", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);
  const targetId = req.params.userId;
  if (targetId === me.id) {
    res.status(400).json({ error: "Cannot report yourself" });
    return;
  }
  const target = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, targetId),
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const parsed = ReportUserBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  await db.insert(userReportsTable).values({
    reporterId: me.id,
    reportedId: targetId,
    conversationId: parsed.data.conversationId ?? null,
    reason: parsed.data.reason?.trim() || null,
  });
  res.status(201).json({ ok: true });
});

router.get("/blocks", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.json({ blockedUserIds: [] });
    return;
  }
  const me = await ensureUser(clerkId);
  const rows = await db
    .select({ blockedId: directBlocksTable.blockedId })
    .from(directBlocksTable)
    .where(eq(directBlocksTable.blockerId, me.id));
  res.json({ blockedUserIds: rows.map((r) => r.blockedId) });
});

// ─── Admin moderation review ────────────────────────────────────────────────

type AdminAuthResult =
  | { ok: true; me: Awaited<ReturnType<typeof ensureUser>> }
  | { ok: false; status: 401 | 403 };

async function requireAdmin(req: Parameters<typeof getAuth>[0]): Promise<AdminAuthResult> {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) return { ok: false, status: 401 };
  const me = await ensureUser(clerkId);
  if (!me.isAdmin) return { ok: false, status: 403 };
  return { ok: true, me };
}

router.get("/moderation/reports", async (req, res): Promise<void> => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" });
    return;
  }
  const parsed = ListUserReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const status = parsed.data.status ?? "pending";

  const rows = await db
    .select()
    .from(userReportsTable)
    .where(status === "all" ? sql`true` : eq(userReportsTable.status, status))
    .orderBy(desc(userReportsTable.createdAt))
    .limit(200);

  const userIds = Array.from(
    new Set(rows.flatMap((r) => [r.reporterId, r.reportedId])),
  );
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const profileById = new Map<string, Awaited<ReturnType<typeof buildUserProfile>>>();
  for (const u of users) {
    profileById.set(u.id, await buildUserProfile(u));
  }

  const reports = rows.map((r) => ({
    id: r.id,
    reporter: profileById.get(r.reporterId)!,
    reported: profileById.get(r.reportedId)!,
    conversationId: r.conversationId,
    reason: r.reason,
    status: r.status,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    reviewedById: r.reviewedById,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json({ reports });
});

router.patch("/moderation/reports/:reportId", async (req, res): Promise<void> => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" });
    return;
  }
  const params = UpdateUserReportStatusParams.safeParse(req.params);
  const body = UpdateUserReportStatusBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  if (!REPORT_STATUSES.includes(body.data.status as ReportStatus)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  // Capture the previous status so we only notify the reporter when the
  // moderator actually transitions the report into a terminal state — not
  // on a no-op PATCH that re-sets the same status (which would otherwise
  // spam the reporter with a fresh notification on every save click).
  const before = await db.query.userReportsTable.findFirst({
    where: eq(userReportsTable.id, Number(params.data.reportId)),
  });

  const [updated] = await db
    .update(userReportsTable)
    .set({
      status: body.data.status,
      reviewedById: auth.me.id,
      reviewedAt: new Date(),
    })
    .where(eq(userReportsTable.id, Number(params.data.reportId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const [reporter, reported] = await Promise.all([
    db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.reporterId) }),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.reportedId) }),
  ]);

  // Notify the reporter only on a transition into a terminal state, and
  // never notify the moderator about their own report (rare but possible).
  const becameTerminal =
    (updated.status === "actioned" || updated.status === "dismissed") &&
    before?.status !== updated.status;
  if (becameTerminal && updated.reporterId !== auth.me.id) {
    const reportedName = reported?.displayName ?? reported?.username ?? "the reported user";
    const message =
      updated.status === "actioned"
        ? `Your report about ${reportedName} was reviewed and acted on. Thank you for keeping the community safe.`
        : `Your report about ${reportedName} was reviewed. No action was taken this time.`;
    await db.insert(notificationsTable).values({
      userId: updated.reporterId,
      type: updated.status === "actioned" ? "report_actioned" : "report_dismissed",
      message,
      actorId: auth.me.id,
      metadata: {
        reportId: updated.id,
        reportedId: updated.reportedId,
        conversationId: updated.conversationId,
      },
      read: false,
    });
  }

  res.json({
    id: updated.id,
    reporter: reporter ? await buildUserProfile(reporter) : null,
    reported: reported ? await buildUserProfile(reported) : null,
    conversationId: updated.conversationId,
    reason: updated.reason,
    status: updated.status,
    reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
    reviewedById: updated.reviewedById,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.get(
  "/moderation/reports/:reportId/conversation",
  async (req, res): Promise<void> => {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      res
        .status(auth.status)
        .json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" });
      return;
    }
    const params = GetUserReportConversationParams.safeParse(req.params);
    const query = GetUserReportConversationQueryParams.safeParse(req.query);
    if (!params.success || !query.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const report = await db.query.userReportsTable.findFirst({
      where: eq(userReportsTable.id, Number(params.data.reportId)),
    });
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (!report.conversationId) {
      res.status(404).json({ error: "Report has no conversation attached" });
      return;
    }

    const convo = await db.query.directConversationsTable.findFirst({
      where: eq(directConversationsTable.id, report.conversationId),
    });
    if (!convo) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const notExpired = or(
      isNull(directMessagesTable.expiresAt),
      gt(directMessagesTable.expiresAt, sql`now()`),
    );

    const rows = await db
      .select()
      .from(directMessagesTable)
      .where(
        and(eq(directMessagesTable.conversationId, convo.id), notExpired),
      )
      .orderBy(asc(directMessagesTable.createdAt))
      .limit(query.data.limit ?? 30);

    res.json({
      conversationId: convo.id,
      messages: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        recipientId: m.recipientId,
        content: m.content,
        expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
        readAt: m.readAt ? m.readAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  },
);

// Grant or revoke a silver/blue verification badge. Admin-only — surfaced
// in the UI as a check-mark next to the user's name. Stored as a free-form
// text column so future tiers can be added without a migration.
router.patch("/admin/users/:userId/verification", async (req, res): Promise<void> => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" });
    return;
  }
  const params = SetUserVerificationTierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  const body = SetUserVerificationTierBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid tier (allowed: silver, blue, null)" });
    return;
  }
  const target = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, params.data.userId),
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ verificationTier: body.data.tier ?? null, updatedAt: new Date() })
    .where(eq(usersTable.id, target.id))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Update failed" });
    return;
  }
  res.json(await buildUserProfile(updated));
});

// List users for the admin moderation UI. Two modes:
//   adminOnly=true  → return the current admin roster (used to render the
//                     "Current admins" list and to power the Demote button).
//   q=<string>      → fuzzy match on username/displayName so an admin can
//                     find a user to promote without knowing their UUID.
// When neither is set we still return the most recently created users so
// the UI has a sensible default state instead of an empty list.
router.get("/admin/users", async (req, res): Promise<void> => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" });
    return;
  }
  const parsed = ListAdminUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const q = parsed.data.q?.trim() ?? "";
  // IMPORTANT: do NOT trust `parsed.data.adminOnly`. Orval emits this as
  // `zod.coerce.boolean()`, and Zod's coerce uses JS truthiness — so the
  // literal string `"false"` would coerce to `true` and silently flip the
  // filter on. Read the raw query value and only treat the literal string
  // "true" (or, defensively, actual boolean true) as enabling the filter.
  const rawAdminOnly: unknown = req.query.adminOnly;
  const adminOnly = rawAdminOnly === "true" || rawAdminOnly === true;
  // Cap the limit server-side regardless of what the client asked for, so
  // an admin (or a buggy/cached client) can't trigger an unbounded scan.
  const limit = Math.min(parsed.data.limit ?? 50, 100);

  const conditions = [];
  if (adminOnly) conditions.push(eq(usersTable.isAdmin, true));
  if (q) {
    conditions.push(
      sql`(${usersTable.username} ILIKE ${"%" + q + "%"} OR ${usersTable.displayName} ILIKE ${"%" + q + "%"})`,
    );
  }
  const where = conditions.length === 0
    ? undefined
    : conditions.length === 1
      ? conditions[0]
      : and(...conditions);

  const rows = await db
    .select()
    .from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit);

  const profiles = await Promise.all(rows.map((u) => buildUserProfile(u)));
  res.json({ users: profiles, total: profiles.length });
});

// Promote / demote a user to admin. Self-demotion is blocked so an admin
// cannot accidentally lock themselves out of the moderation surface; a
// second admin must do it for them. We deliberately do NOT block demoting
// the LAST remaining admin — recovering from a zero-admin state is a DB
// task by design (keeps the runtime check tiny and avoids a count query
// on every demote that could race).
router.patch("/admin/users/:userId/admin", async (req, res): Promise<void> => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" });
    return;
  }
  const params = SetUserAdminParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  const body = SetUserAdminBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body — expected { isAdmin: boolean }" });
    return;
  }
  if (params.data.userId === auth.me.id && body.data.isAdmin === false) {
    res.status(400).json({ error: "You cannot demote yourself. Ask another admin to do it." });
    return;
  }
  const target = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, params.data.userId),
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ isAdmin: body.data.isAdmin, updatedAt: new Date() })
    .where(eq(usersTable.id, target.id))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "Update failed" });
    return;
  }
  res.json(await buildUserProfile(updated));
});

export default router;
