import { db } from "@workspace/db";
import {
  usersTable,
  followsTable,
  postsTable,
  likesTable,
  bountySubmissionsTable,
  bountiesTable,
  communityMembersTable,
  jobApplicationsTable,
  circleMembersTable,
  powerScoreSnapshotsTable,
  dailyStreaksTable,
  endorsementsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { publish } from "./sse-bus";

export interface PowerScoreBreakdown {
  network: number;
  content: number;
  activity: number;
  reputation: number;
  streakBonus: number;
  endorsementBonus: number;
}

export interface PowerScoreResult {
  score: number;
  rank: string;
  breakdown: PowerScoreBreakdown;
}

const RANK_THRESHOLDS: Array<[number, string]> = [
  [800, "THE DON"],
  [600, "INNER CIRCLE"],
  [400, "RISING FORCE"],
  [200, "OPERATIVE"],
  [0, "RECRUIT"],
];

export function rankFor(score: number): string {
  for (const [t, r] of RANK_THRESHOLDS) if (score >= t) return r;
  return "RECRUIT";
}

interface ScoreInputs {
  followers: number;
  following: number;
  posts: number;
  likesReceived: number;
  bountiesWon: number;
  bountiesPosted: number;
  communities: number;
  jobApps: number;
  circles: number;
  accountAgeDays: number;
  streak: number;
  endorsements: number;
}

export function computeFromInputs(i: ScoreInputs): PowerScoreResult {
  const network = Math.min(300, Math.floor(i.followers * 2 + (i.followers > i.following ? i.following * 0.5 : 0)));
  const content = Math.min(300, Math.floor(i.posts * 8 + i.likesReceived * 1.5));
  const activity = Math.min(
    200,
    Math.floor(
      i.posts * 2 + i.following * 0.5 + i.communities * 5 + i.circles * 8 + i.jobApps * 3 + Math.min(30, i.accountAgeDays * 0.1),
    ),
  );
  const reputation = Math.min(200, Math.floor(i.bountiesWon * 50 + i.bountiesPosted * 20 + i.followers * 0.5));
  const streakBonus = Math.min(50, i.streak * 2);
  const endorsementBonus = Math.min(50, i.endorsements * 3);
  const score = Math.min(1000, network + content + activity + reputation + streakBonus + endorsementBonus);
  const rank = rankFor(score);
  return { score, rank, breakdown: { network, content, activity, reputation, streakBonus, endorsementBonus } };
}

async function fetchInputs(userId: string): Promise<ScoreInputs> {
  const [
    user,
    followers,
    following,
    posts,
    likes,
    bountiesWon,
    bountiesPosted,
    communities,
    jobApps,
    circles,
    streak,
    endorsements,
  ] = await Promise.all([
    db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followingId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followerId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(postsTable).where(eq(postsTable.authorId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(likesTable).where(
      sql`${likesTable.postId} IN (SELECT id FROM posts WHERE author_id = ${userId})`,
    ),
    db.select({ count: sql<number>`count(*)` }).from(bountySubmissionsTable).where(
      and(eq(bountySubmissionsTable.submitterId, userId), eq(bountySubmissionsTable.isWinner, true)),
    ),
    db.select({ count: sql<number>`count(*)` }).from(bountiesTable).where(
      and(eq(bountiesTable.posterId, userId), eq(bountiesTable.status, "claimed")),
    ),
    db.select({ count: sql<number>`count(*)` }).from(communityMembersTable).where(eq(communityMembersTable.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(jobApplicationsTable).where(eq(jobApplicationsTable.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(circleMembersTable).where(
      and(eq(circleMembersTable.userId, userId), sql`${circleMembersTable.role} != 'pending'`),
    ),
    db.query.dailyStreaksTable.findFirst({ where: eq(dailyStreaksTable.userId, userId) }),
    db.select({ count: sql<number>`count(*)` }).from(endorsementsTable).where(eq(endorsementsTable.endorseeId, userId)),
  ]);

  const accountAgeDays = user?.createdAt
    ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000)
    : 0;

  return {
    followers: Number(followers[0]?.count ?? 0),
    following: Number(following[0]?.count ?? 0),
    posts: Number(posts[0]?.count ?? 0),
    likesReceived: Number(likes[0]?.count ?? 0),
    bountiesWon: Number(bountiesWon[0]?.count ?? 0),
    bountiesPosted: Number(bountiesPosted[0]?.count ?? 0),
    communities: Number(communities[0]?.count ?? 0),
    jobApps: Number(jobApps[0]?.count ?? 0),
    circles: Number(circles[0]?.count ?? 0),
    accountAgeDays,
    streak: Number(streak?.currentStreak ?? 0),
    endorsements: Number(endorsements[0]?.count ?? 0),
  };
}

export async function getPowerScore(userId: string): Promise<PowerScoreResult> {
  const inputs = await fetchInputs(userId);
  return computeFromInputs(inputs);
}

const CACHE_TTL_MS = 30_000;

export async function getPowerScoreCached(userId: string): Promise<PowerScoreResult> {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (
    user?.powerScoreCached != null &&
    user.powerRankCached &&
    user.powerScoreCachedAt &&
    Date.now() - new Date(user.powerScoreCachedAt).getTime() < CACHE_TTL_MS
  ) {
    return {
      score: user.powerScoreCached,
      rank: user.powerRankCached,
      breakdown: { network: 0, content: 0, activity: 0, reputation: 0, streakBonus: 0, endorsementBonus: 0 },
    };
  }
  return getPowerScore(userId);
}

export async function recomputePowerScore(userId: string): Promise<PowerScoreResult> {
  const result = await getPowerScore(userId);
  await Promise.all([
    db
      .update(usersTable)
      .set({ powerScoreCached: result.score, powerRankCached: result.rank, powerScoreCachedAt: new Date() })
      .where(eq(usersTable.id, userId)),
    db.insert(powerScoreSnapshotsTable).values({
      userId,
      score: result.score,
      rank: result.rank,
      breakdown: result.breakdown,
    }),
  ]);
  publish("power-score", userId, {
    type: "power-score",
    score: result.score,
    rank: result.rank,
    breakdown: result.breakdown,
    at: new Date().toISOString(),
  });
  return result;
}

export async function getBatchPowerScores(
  userIds: string[],
): Promise<Map<string, { score: number; rank: string }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: usersTable.id,
      score: usersTable.powerScoreCached,
      rank: usersTable.powerRankCached,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  const result = new Map<string, { score: number; rank: string }>();
  const missing: string[] = [];
  for (const r of rows) {
    if (r.score != null && r.rank) result.set(r.id, { score: r.score, rank: r.rank });
    else missing.push(r.id);
  }
  // Fill in missing with on-demand recompute (cold cache).
  for (const id of missing) {
    const ps = await recomputePowerScore(id);
    result.set(id, { score: ps.score, rank: ps.rank });
  }
  return result;
}
