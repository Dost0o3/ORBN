import { Router } from "express";
import { db } from "@workspace/db";
import { bountiesTable, bountySubmissionsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { ensureUser, buildUserProfile } from "./users";
import { recomputePowerScore } from "../lib/power-score";
import { updateStreak } from "../lib/streaks";
import { evaluateAchievements } from "../lib/achievements";

const router = Router();

const CreateBountyBody = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  reward: z.string().min(1),
  deadline: z.string().optional(),
});

const CreateBountySubmissionBody = z.object({
  content: z.string().min(1),
  link: z.string().optional(),
});

async function buildBounty(bounty: typeof bountiesTable.$inferSelect, viewerClerkId?: string) {
  const poster = await db.query.usersTable.findFirst({ where: eq(usersTable.id, bounty.posterId) });
  const posterProfile = poster ? await buildUserProfile(poster, viewerClerkId) : null;
  const [submissionsRow] = await db.select({ count: sql<number>`count(*)` }).from(bountySubmissionsTable).where(eq(bountySubmissionsTable.bountyId, bounty.id));
  return {
    ...bounty,
    poster: posterProfile,
    submissionsCount: Number(submissionsRow?.count ?? 0),
  };
}

router.get("/bounties", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const category = req.query.category as string | undefined;
  const status = req.query.status as string | undefined;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  const conditions: ReturnType<typeof and>[] = [];
  if (category) conditions.push(eq(bountiesTable.category, category));
  if (status) conditions.push(eq(bountiesTable.status, status as "open" | "closed" | "claimed"));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [bounties, totalRow] = await Promise.all([
    db.select().from(bountiesTable).where(whereClause).orderBy(desc(bountiesTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(bountiesTable).where(whereClause),
  ]);

  const enriched = await Promise.all(bounties.map(b => buildBounty(b, clerkId ?? undefined)));
  res.json({ bounties: enriched, total: Number(totalRow[0]?.count ?? 0) });
});

router.post("/bounties", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateBountyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const { title, description, category, reward, deadline } = parsed.data;
  const [bounty] = await db.insert(bountiesTable).values({
    posterId: user.id, title, description, category, reward,
    deadline: deadline ?? null, status: "open",
  }).returning();
  const enriched = await buildBounty(bounty, clerkId);
  res.status(201).json(enriched);
});

router.get("/bounties/:bountyId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const bountyId = parseInt(req.params.bountyId);
  const bounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bountyId) });
  if (!bounty) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await buildBounty(bounty, clerkId ?? undefined);
  res.json(enriched);
});

router.get("/bounties/:bountyId/submissions", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const bountyId = parseInt(req.params.bountyId);
  const submissions = await db.select().from(bountySubmissionsTable).where(eq(bountySubmissionsTable.bountyId, bountyId)).orderBy(desc(bountySubmissionsTable.createdAt));
  const enriched = await Promise.all(submissions.map(async (s) => {
    const submitter = await db.query.usersTable.findFirst({ where: eq(usersTable.id, s.submitterId) });
    const submitterProfile = submitter ? await buildUserProfile(submitter, clerkId ?? undefined) : null;
    return { ...s, submitter: submitterProfile };
  }));
  res.json({ submissions: enriched });
});

router.post("/bounties/:bountyId/submissions", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bountyId = parseInt(req.params.bountyId);
  const parsed = CreateBountySubmissionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const bounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bountyId) });
  if (!bounty) { res.status(404).json({ error: "Bounty not found" }); return; }
  if (bounty.status !== "open") { res.status(400).json({ error: "This bounty is no longer accepting submissions" }); return; }

  const user = await ensureUser(clerkId);

  const existing = await db.query.bountySubmissionsTable.findFirst({
    where: and(eq(bountySubmissionsTable.bountyId, bountyId), eq(bountySubmissionsTable.submitterId, user.id))
  });
  if (existing) { res.status(400).json({ error: "You have already submitted to this bounty" }); return; }

  const { content, link } = parsed.data;
  const [submission] = await db.insert(bountySubmissionsTable).values({
    bountyId, submitterId: user.id, content, link: link ?? null, isWinner: false,
  }).returning();
  const submitterProfile = await buildUserProfile(user, clerkId);

  if (bounty.posterId !== user.id) {
    await db.insert(notificationsTable).values({
      userId: bounty.posterId,
      type: "bounty_submission",
      message: `Someone submitted a solution to your bounty "${bounty.title}"`,
      actorId: user.id,
      postId: bounty.id,
      read: false,
    });
  }

  res.status(201).json({ ...submission, submitter: submitterProfile });
});

router.put("/bounties/:bountyId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bountyId = parseInt(req.params.bountyId);
  const user = await ensureUser(clerkId);
  const bounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bountyId) });
  if (!bounty) { res.status(404).json({ error: "Bounty not found" }); return; }
  if (bounty.posterId !== user.id) { res.status(403).json({ error: "Only the bounty poster can edit this bounty" }); return; }
  if (bounty.status !== "open") { res.status(400).json({ error: "Cannot edit a closed or claimed bounty" }); return; }
  const UpdateBountyBody = z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    reward: z.string().min(1).optional(),
    deadline: z.string().nullable().optional(),
  });
  const parsed = UpdateBountyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const [updated] = await db.update(bountiesTable).set({ ...parsed.data }).where(eq(bountiesTable.id, bountyId)).returning();
  const enriched = await buildBounty(updated, clerkId);
  res.json(enriched);
});

router.delete("/bounties/:bountyId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bountyId = parseInt(req.params.bountyId);
  const user = await ensureUser(clerkId);
  const bounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bountyId) });
  if (!bounty) { res.status(404).json({ error: "Bounty not found" }); return; }
  if (bounty.posterId !== user.id) { res.status(403).json({ error: "Only the bounty poster can delete this bounty" }); return; }
  if (bounty.status !== "open") { res.status(400).json({ error: "Cannot delete a closed or claimed bounty" }); return; }
  await db.delete(bountySubmissionsTable).where(eq(bountySubmissionsTable.bountyId, bountyId));
  await db.delete(bountiesTable).where(eq(bountiesTable.id, bountyId));
  res.json({ deleted: true });
});

router.post("/bounties/:bountyId/close", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bountyId = parseInt(req.params.bountyId);
  const user = await ensureUser(clerkId);
  const bounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bountyId) });
  if (!bounty) { res.status(404).json({ error: "Bounty not found" }); return; }
  if (bounty.posterId !== user.id) { res.status(403).json({ error: "Only the bounty poster can close this bounty" }); return; }
  if (bounty.status !== "open") { res.status(400).json({ error: "Bounty is not open" }); return; }
  const [updated] = await db.update(bountiesTable).set({ status: "closed" }).where(eq(bountiesTable.id, bountyId)).returning();
  const enriched = await buildBounty(updated, clerkId);
  res.json(enriched);
});

router.put("/bounties/:bountyId/submissions/:submissionId/winner", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bountyId = parseInt(req.params.bountyId);
  const submissionId = parseInt(req.params.submissionId);
  const user = await ensureUser(clerkId);
  const bounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bountyId) });
  if (!bounty) { res.status(404).json({ error: "Bounty not found" }); return; }
  if (bounty.posterId !== user.id) { res.status(403).json({ error: "Only the bounty poster can select a winner" }); return; }
  if (bounty.status !== "open") { res.status(400).json({ error: "This bounty has already been claimed or closed" }); return; }

  const targetSubmission = await db.query.bountySubmissionsTable.findFirst({
    where: and(eq(bountySubmissionsTable.id, submissionId), eq(bountySubmissionsTable.bountyId, bountyId))
  });
  if (!targetSubmission) { res.status(404).json({ error: "Submission does not belong to this bounty" }); return; }

  await db.update(bountySubmissionsTable).set({ isWinner: false }).where(eq(bountySubmissionsTable.bountyId, bountyId));
  const [submission] = await db.update(bountySubmissionsTable).set({ isWinner: true }).where(
    and(eq(bountySubmissionsTable.id, submissionId), eq(bountySubmissionsTable.bountyId, bountyId))
  ).returning();
  await db.update(bountiesTable).set({ status: "claimed", winnerId: submission.submitterId }).where(eq(bountiesTable.id, bountyId));
  const submitter = await db.query.usersTable.findFirst({ where: eq(usersTable.id, submission.submitterId) });
  const submitterProfile = submitter ? await buildUserProfile(submitter, clerkId) : null;

  // Bounty win is a power-score event for the winner AND the poster (bountiesPosted feeds reputation sub-score).
  Promise.all([
    recomputePowerScore(submission.submitterId),
    updateStreak(submission.submitterId),
    evaluateAchievements(submission.submitterId),
    recomputePowerScore(user.id),
    updateStreak(user.id),
    evaluateAchievements(user.id),
  ]).catch(() => {});

  if (submission.submitterId !== user.id) {
    await db.insert(notificationsTable).values({
      userId: submission.submitterId,
      type: "bounty_winner",
      message: `You were selected as the winner for the bounty "${bounty.title}"`,
      actorId: user.id,
      postId: bounty.id,
      read: false,
    });
  }

  res.json({ ...submission, submitter: submitterProfile });
});

export default router;
