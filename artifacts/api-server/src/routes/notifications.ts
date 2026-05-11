import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { ListNotificationsQueryParams } from "@workspace/api-zod";
import { ensureUser } from "./users";

const router = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const query = ListNotificationsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 30) : 30;
  const unreadOnly = query.success ? query.data.unreadOnly : false;

  let notifs;
  if (unreadOnly) {
    notifs = await db.select().from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false))).orderBy(desc(notificationsTable.createdAt)).limit(limit);
  } else {
    notifs = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, user.id)).orderBy(desc(notificationsTable.createdAt)).limit(limit);
  }

  const enriched = await Promise.all(notifs.map(async n => {
    let actorName = null, actorAvatar = null;
    if (n.actorId) {
      const actor = await db.query.usersTable.findFirst({ where: eq(usersTable.id, n.actorId) });
      actorName = actor?.displayName ?? null;
      actorAvatar = actor?.avatarUrl ?? null;
    }
    return { ...n, actorName, actorAvatar };
  }));

  const [unread] = await db.select({ count: sql<number>`count(*)` }).from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));
  res.json({ notifications: enriched, unreadCount: Number(unread?.count ?? 0) });
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.userId, user.id));
  res.json({ success: true });
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.json({ count: 0 }); return; }
  const user = await ensureUser(clerkId);
  const [unread] = await db.select({ count: sql<number>`count(*)` }).from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));
  res.json({ count: Number(unread?.count ?? 0) });
});

export default router;
