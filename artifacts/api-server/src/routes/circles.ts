import { Router } from "express";
import { db } from "@workspace/db";
import { circlesTable, circleMembersTable, circlePostsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { ensureUser, buildUserProfile, getPowerScore, getBatchPowerScores } from "./users";

const router = Router();

const CreateCircleBody = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  minPowerScore: z.number().int().min(0).default(0),
  isInviteOnly: z.boolean().default(false),
});

const UpdateCircleBody = z.object({
  name: z.string().min(1).optional(),
  tagline: z.string().min(1).optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
});

const CreateCirclePostBody = z.object({
  content: z.string().min(1),
});

async function buildCircle(circle: typeof circlesTable.$inferSelect, viewerClerkId?: string) {
  const creator = await db.query.usersTable.findFirst({ where: eq(usersTable.id, circle.creatorId) });
  const creatorProfile = creator ? await buildUserProfile(creator, viewerClerkId) : null;
  const [members] = await db.select({ count: sql<number>`count(*)` })
    .from(circleMembersTable)
    .where(and(eq(circleMembersTable.circleId, circle.id), sql`${circleMembersTable.role} != 'pending'`));
  let isMember = false;
  let isPending = false;
  if (viewerClerkId) {
    const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, viewerClerkId) });
    if (viewer) {
      const membership = await db.query.circleMembersTable.findFirst({
        where: sql`${circleMembersTable.circleId} = ${circle.id} AND ${circleMembersTable.userId} = ${viewer.id}`
      });
      isMember = !!membership && membership.role !== "pending";
      isPending = !!membership && membership.role === "pending";
    }
  }
  return { ...circle, creator: creatorProfile, membersCount: Number(members?.count ?? 0), isMember, isPending };
}

router.get("/circles", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const limit = parseInt(req.query.limit as string) || 20;
  const circles = await db.select().from(circlesTable).orderBy(desc(circlesTable.createdAt)).limit(limit);
  const enriched = await Promise.all(circles.map(c => buildCircle(c, clerkId ?? undefined)));
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(circlesTable);
  res.json({ circles: enriched, total: Number(total?.count ?? 0) });
});

router.post("/circles", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateCircleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const { name, tagline, description, coverImageUrl, minPowerScore, isInviteOnly } = parsed.data;
  const [circle] = await db.insert(circlesTable).values({
    creatorId: user.id, name, tagline,
    description: description ?? null,
    coverImageUrl: coverImageUrl ?? null,
    minPowerScore: minPowerScore ?? 0,
    isInviteOnly: isInviteOnly ?? false,
  }).returning();
  await db.insert(circleMembersTable).values({ circleId: circle.id, userId: user.id, role: "don" });
  const enriched = await buildCircle(circle, clerkId);
  res.status(201).json(enriched);
});

router.get("/circles/:circleId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const circleId = parseInt(req.params.circleId);
  const circle = await db.query.circlesTable.findFirst({ where: eq(circlesTable.id, circleId) });
  if (!circle) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await buildCircle(circle, clerkId ?? undefined);
  res.json(enriched);
});

router.put("/circles/:circleId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const parsed = UpdateCircleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const donMembership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${user.id} AND ${circleMembersTable.role} = 'don'`
  });
  if (!donMembership) { res.status(403).json({ error: "Only the DON can update circle details" }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.tagline !== undefined) updates.tagline = parsed.data.tagline;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.coverImageUrl !== undefined) updates.coverImageUrl = parsed.data.coverImageUrl;
  const [updated] = await db.update(circlesTable).set(updates).where(eq(circlesTable.id, circleId)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await buildCircle(updated, clerkId);
  res.json(enriched);
});

router.post("/circles/:circleId/request", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const user = await ensureUser(clerkId);
  const circle = await db.query.circlesTable.findFirst({ where: eq(circlesTable.id, circleId) });
  if (!circle) { res.status(404).json({ error: "Not found" }); return; }

  const { score: userScore } = await getPowerScore(user.id);
  if (userScore < circle.minPowerScore) {
    res.status(403).json({ error: `Power Score ${userScore} is below this circle's minimum of ${circle.minPowerScore}` }); return;
  }

  const existing = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${user.id}`
  });

  if (circle.isInviteOnly) {
    if (existing) {
      const isPending = existing.role === "pending";
      res.json({ joined: !isPending, pending: isPending }); return;
    }
    await db.insert(circleMembersTable).values({ circleId, userId: user.id, role: "pending" });

    if (circle.creatorId !== user.id) {
      await db.insert(notificationsTable).values({
        userId: circle.creatorId,
        type: "circle_join_request",
        message: `Someone requested to join your Circle "${circle.name}"`,
        actorId: user.id,
        read: false,
      });
    }

    res.json({ joined: false, pending: true }); return;
  }

  const membersRows = await db.select({ count: sql<number>`count(*)` })
    .from(circleMembersTable)
    .where(and(eq(circleMembersTable.circleId, circleId), sql`${circleMembersTable.role} != 'pending'`));
  const memberCount = Number(membersRows[0]?.count ?? 0);
  if (memberCount >= 50) {
    res.status(403).json({ error: "This circle is at capacity (50 members max)." }); return;
  }

  if (existing) {
    res.json({ joined: true, pending: false, membersCount: memberCount }); return;
  }

  await db.insert(circleMembersTable).values({ circleId, userId: user.id, role: "member" });

  if (circle.creatorId !== user.id) {
    await db.insert(notificationsTable).values({
      userId: circle.creatorId,
      type: "circle_joined",
      message: `Someone joined your Circle "${circle.name}"`,
      actorId: user.id,
      read: false,
    });
  }

  const updatedRows = await db.select({ count: sql<number>`count(*)` })
    .from(circleMembersTable)
    .where(and(eq(circleMembersTable.circleId, circleId), sql`${circleMembersTable.role} != 'pending'`));
  res.json({ joined: true, pending: false, membersCount: Number(updatedRows[0]?.count ?? 0) });
});

router.post("/circles/:circleId/invite", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const { userId: targetUserId } = z.object({ userId: z.string().min(1) }).parse(req.body);
  const approver = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const donMembership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${approver.id} AND ${circleMembersTable.role} = 'don'`
  });
  if (!donMembership) { res.status(403).json({ error: "Only circle DONs can invite members" }); return; }
  const existing = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${targetUserId}`
  });
  if (existing) { res.json({ invited: false, reason: "Already a member or pending" }); return; }
  const [capRow] = await db.select({ count: sql<number>`count(*)` })
    .from(circleMembersTable)
    .where(and(eq(circleMembersTable.circleId, circleId), sql`${circleMembersTable.role} != 'pending'`));
  if (Number(capRow?.count ?? 0) >= 50) {
    res.status(403).json({ error: "Circle is at capacity (50 members max)" }); return;
  }
  await db.insert(circleMembersTable).values({ circleId, userId: targetUserId, role: "member" });
  res.json({ invited: true });
});

router.get("/circles/:circleId/pending", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!viewer) { res.status(401).json({ error: "Unauthorized" }); return; }
  const donMembership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${viewer.id} AND ${circleMembersTable.role} = 'don'`
  });
  if (!donMembership) { res.status(403).json({ error: "DON only" }); return; }
  const pendingRows = await db.select().from(circleMembersTable)
    .where(sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.role} = 'pending'`);
  const pendingUserIds = pendingRows.map(m => m.userId);
  const [pendingProfiles, pendingPowerScores] = await Promise.all([
    Promise.all(pendingRows.map(async (m) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, m.userId) });
      const profile = user ? await buildUserProfile(user, clerkId) : null;
      return { profile, role: m.role };
    })),
    getBatchPowerScores(pendingUserIds),
  ]);
  const enriched = pendingProfiles.map(({ profile, role }, i) => ({
    ...profile,
    role,
    powerScore: pendingPowerScores.get(pendingUserIds[i])?.score ?? null,
    powerRank: pendingPowerScores.get(pendingUserIds[i])?.rank ?? null,
  }));
  res.json({ pending: enriched });
});

router.post("/circles/:circleId/members/:userId/approve", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const targetUserId = req.params.userId;
  const approver = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const approverMembership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${approver.id} AND ${circleMembersTable.role} = 'don'`
  });
  if (!approverMembership) { res.status(403).json({ error: "Only circle DONs can approve requests" }); return; }
  const pending = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${targetUserId} AND ${circleMembersTable.role} = 'pending'`
  });
  if (!pending) { res.status(404).json({ error: "No pending request found" }); return; }
  const [capRow] = await db.select({ count: sql<number>`count(*)` })
    .from(circleMembersTable)
    .where(and(eq(circleMembersTable.circleId, circleId), sql`${circleMembersTable.role} != 'pending'`));
  if (Number(capRow?.count ?? 0) >= 50) {
    res.status(403).json({ error: "Circle is at capacity (50 members max)" }); return;
  }
  await db.update(circleMembersTable).set({ role: "member" })
    .where(sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${targetUserId}`);
  res.json({ approved: true });
});

router.delete("/circles/:circleId/members/:userId/approve", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const targetUserId = req.params.userId;
  const approver = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!approver) { res.status(401).json({ error: "Unauthorized" }); return; }
  const approverMembership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${approver.id} AND ${circleMembersTable.role} = 'don'`
  });
  if (!approverMembership) { res.status(403).json({ error: "Only circle DONs can reject requests" }); return; }
  await db.delete(circleMembersTable)
    .where(sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${targetUserId} AND ${circleMembersTable.role} = 'pending'`);
  res.json({ rejected: true });
});

router.get("/circles/:circleId/members", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const circleId = parseInt(req.params.circleId);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!viewer) { res.status(401).json({ error: "Unauthorized" }); return; }
  const membership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${viewer.id} AND ${circleMembersTable.role} IN ('don', 'member')`
  });
  if (!membership) { res.status(403).json({ error: "Members only" }); return; }
  const members = await db.select().from(circleMembersTable)
    .where(sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.role} IN ('don', 'member')`);
  const memberUserIds = members.map(m => m.userId);
  const [memberProfiles, memberPowerScores] = await Promise.all([
    Promise.all(members.map(async (m) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, m.userId) });
      const profile = user ? await buildUserProfile(user, clerkId) : null;
      return { profile, role: m.role };
    })),
    getBatchPowerScores(memberUserIds),
  ]);
  const enriched = memberProfiles.map(({ profile, role }, i) => ({
    ...profile,
    role,
    powerScore: memberPowerScores.get(memberUserIds[i])?.score ?? null,
    powerRank: memberPowerScores.get(memberUserIds[i])?.rank ?? null,
  }));
  res.json({ members: enriched });
});

router.get("/circles/:circleId/posts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const circleId = parseInt(req.params.circleId);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const membership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${user.id} AND ${circleMembersTable.role} IN ('don', 'member')`
  });
  if (!membership) { res.status(403).json({ error: "Members only" }); return; }
  const posts = await db.select().from(circlePostsTable).where(eq(circlePostsTable.circleId, circleId)).orderBy(desc(circlePostsTable.createdAt)).limit(50);
  const circlePostAuthors = await Promise.all(posts.map(async (p) => {
    const author = await db.query.usersTable.findFirst({ where: eq(usersTable.id, p.authorId) });
    const authorProfile = author ? await buildUserProfile(author, clerkId) : null;
    return { post: p, author: authorProfile };
  }));
  const circleAuthorIds = [...new Set(circlePostAuthors.map(x => x.author?.id).filter((id): id is string => Boolean(id)))];
  const circleAuthorPowerScores = await getBatchPowerScores(circleAuthorIds);
  const enriched = circlePostAuthors.map(({ post, author }) => ({
    ...post,
    author: author ? { ...author, powerScore: circleAuthorPowerScores.get(author.id)?.score ?? null, powerRank: circleAuthorPowerScores.get(author.id)?.rank ?? null } : null,
  }));
  res.json({ posts: enriched });
});

router.post("/circles/:circleId/posts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const circleId = parseInt(req.params.circleId);
  const parsed = CreateCirclePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const membership = await db.query.circleMembersTable.findFirst({
    where: sql`${circleMembersTable.circleId} = ${circleId} AND ${circleMembersTable.userId} = ${user.id} AND ${circleMembersTable.role} IN ('don', 'member')`
  });
  if (!membership) { res.status(403).json({ error: "Members only" }); return; }
  const [post] = await db.insert(circlePostsTable).values({ circleId, authorId: user.id, content: parsed.data.content }).returning();
  const authorProfile = await buildUserProfile(user, clerkId);
  res.status(201).json({ ...post, author: authorProfile });
});

export default router;
