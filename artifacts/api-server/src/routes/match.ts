import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  followsTable,
  matchSwipesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, sql, inArray, notInArray, gte } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { ensureUser, getPowerScore, getBatchPowerScores } from "./users";

const router = Router();

const SwipeBody = z.object({
  targetUserId: z.string().min(1),
  direction: z.enum(["like", "pass", "superlike"]),
});

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const A = new Set(a.map(s => s.toLowerCase().trim()).filter(Boolean));
  const B = new Set(b.map(s => s.toLowerCase().trim()).filter(Boolean));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function powerBandSimilarity(a: number, b: number): number {
  // Both within ~100 pts feels close; further apart linearly decays.
  const diff = Math.abs(a - b);
  return Math.max(0, 1 - diff / 300);
}

interface CandidateUser {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  location: string | null;
  skills: string[];
  powerScore: number;
  rank: string;
  compatibilityScore: number;
  reasons: string[];
}

router.get("/match/candidates", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const me = await ensureUser(clerkId);
  const limit = Math.min(parseInt((req.query.limit as string) || "10", 10) || 10, 25);

  // Exclude users we've already swiped on, plus self.
  const swiped = await db
    .select({ targetId: matchSwipesTable.targetId })
    .from(matchSwipesTable)
    .where(eq(matchSwipesTable.swiperId, me.id));
  const excludeIds = [me.id, ...swiped.map(s => s.targetId)];

  // Pull a pool of recent users we haven't swiped on; we'll score in-memory.
  const pool = await db
    .select()
    .from(usersTable)
    .where(and(
      notInArray(usersTable.id, excludeIds),
      eq(usersTable.ghostMode, false),
    ))
    .limit(80);

  const myScoreData = await getPowerScore(me.id);
  const mySkills = Array.isArray(me.skills) ? me.skills : [];

  // Batch-fetch power scores in a single grouped query instead of N×10 round trips.
  const scoreMap = await getBatchPowerScores(pool.map(u => u.id));

  const scored: CandidateUser[] = pool.map((u) => {
      const ps = scoreMap.get(u.id) ?? { score: 0, rank: "RECRUIT" };
      const skills = Array.isArray(u.skills) ? u.skills : [];

      const skillSim = jaccard(mySkills, skills); // 0..1
      const powerSim = powerBandSimilarity(myScoreData.score, ps.score); // 0..1
      const sameLocation = !!(me.location && u.location && me.location.trim().toLowerCase() === u.location.trim().toLowerCase());
      const hasBio = !!u.bio && u.bio.length > 20;
      const hasAvatar = !!u.avatarUrl;

      // Weighted compatibility 0..100
      const compatibility = Math.round(
        skillSim * 40 +
        powerSim * 25 +
        (sameLocation ? 15 : 0) +
        (hasBio ? 10 : 0) +
        (hasAvatar ? 5 : 0) +
        Math.min(5, ps.score / 200) // tiny boost for established profiles
      );

      const reasons: string[] = [];
      const sharedSkills = mySkills.filter(s =>
        skills.some(t => t.toLowerCase().trim() === s.toLowerCase().trim())
      );
      if (sharedSkills.length) {
        reasons.push(`${sharedSkills.length} shared skill${sharedSkills.length > 1 ? "s" : ""}: ${sharedSkills.slice(0, 3).join(", ")}`);
      }
      if (sameLocation) reasons.push(`Both in ${u.location}`);
      if (powerSim > 0.85) reasons.push("Similar reputation tier");
      if (ps.rank === "THE DON" || ps.rank === "INNER CIRCLE") reasons.push(`Elite ${ps.rank} member`);

      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        bio: u.bio,
        avatarUrl: u.avatarUrl,
        coverUrl: u.coverUrl,
        location: u.location,
        skills,
        powerScore: ps.score,
        rank: ps.rank,
        compatibilityScore: Math.min(100, compatibility),
        reasons,
      };
  });

  scored.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  res.json({ candidates: scored.slice(0, limit) });
});

router.post("/match/swipe", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SwipeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

  const me = await ensureUser(clerkId);
  const { targetUserId, direction } = parsed.data;

  if (targetUserId === me.id) {
    res.status(400).json({ error: "Cannot swipe on yourself" });
    return;
  }

  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, targetUserId) });
  if (!target) { res.status(404).json({ error: "Target user not found" }); return; }

  // Idempotent upsert: if a row exists, update direction.
  const existing = await db.query.matchSwipesTable.findFirst({
    where: and(eq(matchSwipesTable.swiperId, me.id), eq(matchSwipesTable.targetId, targetUserId)),
  });
  if (existing) {
    await db.update(matchSwipesTable)
      .set({ direction, createdAt: new Date() })
      .where(eq(matchSwipesTable.id, existing.id));
  } else {
    await db.insert(matchSwipesTable).values({
      swiperId: me.id,
      targetId: targetUserId,
      direction,
    });
  }

  let matched = false;
  if (direction === "like" || direction === "superlike") {
    // Mutual like check
    const reciprocal = await db.query.matchSwipesTable.findFirst({
      where: and(
        eq(matchSwipesTable.swiperId, targetUserId),
        eq(matchSwipesTable.targetId, me.id),
        inArray(matchSwipesTable.direction, ["like", "superlike"]),
      ),
    });
    if (reciprocal) {
      matched = true;
      // Auto-create mutual follow on match
      const existingFollow = await db.query.followsTable.findFirst({
        where: and(eq(followsTable.followerId, me.id), eq(followsTable.followingId, targetUserId)),
      });
      if (!existingFollow) {
        await db.insert(followsTable).values({ followerId: me.id, followingId: targetUserId });
      }
      const existingFollow2 = await db.query.followsTable.findFirst({
        where: and(eq(followsTable.followerId, targetUserId), eq(followsTable.followingId, me.id)),
      });
      if (!existingFollow2) {
        await db.insert(followsTable).values({ followerId: targetUserId, followingId: me.id });
      }
      // Idempotent notifications: skip if a recent match notification already
      // exists between these two users (defends against parallel-swipe race).
      const recentCutoff = new Date(Date.now() - 60 * 60 * 1000);
      const existingNotif = await db.query.notificationsTable.findFirst({
        where: and(
          eq(notificationsTable.type, "match"),
          eq(notificationsTable.userId, me.id),
          eq(notificationsTable.actorId, targetUserId),
          gte(notificationsTable.createdAt, recentCutoff),
        ),
      });
      if (!existingNotif) {
        await db.insert(notificationsTable).values([
          { userId: me.id, type: "match", message: `You matched with ${target.displayName}`, actorId: targetUserId, read: false },
          { userId: targetUserId, type: "match", message: `You matched with ${me.displayName}`, actorId: me.id, read: false },
        ]);
      }
    }
  }

  res.json({
    success: true,
    matched,
    target: matched ? {
      id: target.id,
      username: target.username,
      displayName: target.displayName,
      avatarUrl: target.avatarUrl,
    } : null,
  });
});

router.get("/match/matches", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const me = await ensureUser(clerkId);

  // I liked them AND they liked me → mutual.
  const myLikes = await db
    .select({ targetId: matchSwipesTable.targetId, createdAt: matchSwipesTable.createdAt })
    .from(matchSwipesTable)
    .where(and(
      eq(matchSwipesTable.swiperId, me.id),
      inArray(matchSwipesTable.direction, ["like", "superlike"]),
    ));

  if (myLikes.length === 0) {
    res.json({ matches: [] });
    return;
  }

  const targetIds = myLikes.map(l => l.targetId);
  const reciprocal = await db
    .select({ swiperId: matchSwipesTable.swiperId })
    .from(matchSwipesTable)
    .where(and(
      eq(matchSwipesTable.targetId, me.id),
      inArray(matchSwipesTable.swiperId, targetIds),
      inArray(matchSwipesTable.direction, ["like", "superlike"]),
    ));

  const matchedIds = new Set(reciprocal.map(r => r.swiperId));
  if (matchedIds.size === 0) {
    res.json({ matches: [] });
    return;
  }

  const matchedUsers = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, Array.from(matchedIds)));

  const result = matchedUsers.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    location: u.location,
    skills: Array.isArray(u.skills) ? u.skills : [],
  }));

  res.json({ matches: result });
});

export default router;
