import { db } from "@workspace/db";
import {
  achievementsTable,
  notificationsTable,
  followsTable,
  postsTable,
  likesTable,
  bountySubmissionsTable,
  dailyStreaksTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { publish } from "./sse-bus";

interface AchievementDef {
  code: string;
  title: string;
  description: string;
  icon: string;
  check: (s: Stats) => boolean;
}

interface Stats {
  posts: number;
  likesReceived: number;
  followers: number;
  bountiesWon: number;
  streak: number;
}

const DEFS: AchievementDef[] = [
  { code: "first-post", title: "Signal Sent", description: "Published your first post.", icon: "Sparkles", check: (s) => s.posts >= 1 },
  { code: "post-10", title: "Voice Locked In", description: "Published 10 posts.", icon: "Mic", check: (s) => s.posts >= 10 },
  { code: "post-50", title: "Broadcaster", description: "Published 50 posts.", icon: "Radio", check: (s) => s.posts >= 50 },
  { code: "first-follower", title: "First Disciple", description: "Picked up your first follower.", icon: "UserPlus", check: (s) => s.followers >= 1 },
  { code: "followers-50", title: "Cult Status", description: "Hit 50 followers.", icon: "Users", check: (s) => s.followers >= 50 },
  { code: "followers-500", title: "Network Node", description: "Hit 500 followers.", icon: "Network", check: (s) => s.followers >= 500 },
  { code: "likes-100", title: "Resonance", description: "Earned 100 likes across your posts.", icon: "Heart", check: (s) => s.likesReceived >= 100 },
  { code: "bounty-1", title: "First Bag", description: "Won your first bounty.", icon: "Trophy", check: (s) => s.bountiesWon >= 1 },
  { code: "bounty-5", title: "Operator", description: "Won 5 bounties.", icon: "Award", check: (s) => s.bountiesWon >= 5 },
  { code: "streak-3", title: "Showing Up", description: "3-day streak.", icon: "Flame", check: (s) => s.streak >= 3 },
  { code: "streak-7", title: "Weekly Operator", description: "7-day streak.", icon: "Flame", check: (s) => s.streak >= 7 },
  { code: "streak-30", title: "Lockstep", description: "30-day streak.", icon: "Flame", check: (s) => s.streak >= 30 },
];

async function fetchStats(userId: string): Promise<Stats> {
  const [posts, likes, followers, bountiesWon, streakRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(postsTable).where(eq(postsTable.authorId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(likesTable).where(
      sql`${likesTable.postId} IN (SELECT id FROM posts WHERE author_id = ${userId})`,
    ),
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followingId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(bountySubmissionsTable).where(
      and(eq(bountySubmissionsTable.submitterId, userId), eq(bountySubmissionsTable.isWinner, true)),
    ),
    db.query.dailyStreaksTable.findFirst({ where: eq(dailyStreaksTable.userId, userId) }),
  ]);
  return {
    posts: Number(posts[0]?.count ?? 0),
    likesReceived: Number(likes[0]?.count ?? 0),
    followers: Number(followers[0]?.count ?? 0),
    bountiesWon: Number(bountiesWon[0]?.count ?? 0),
    streak: streakRow?.currentStreak ?? 0,
  };
}

export async function evaluateAchievements(userId: string): Promise<{ newlyAwarded: string[] }> {
  const stats = await fetchStats(userId);
  const existing = await db.select({ code: achievementsTable.code }).from(achievementsTable).where(eq(achievementsTable.userId, userId));
  const have = new Set(existing.map((r) => r.code));
  const newlyAwarded: string[] = [];

  for (const d of DEFS) {
    if (have.has(d.code)) continue;
    if (!d.check(stats)) continue;
    try {
      await db.insert(achievementsTable).values({
        userId,
        code: d.code,
        title: d.title,
        description: d.description,
        icon: d.icon,
      });
      await db.insert(notificationsTable).values({
        userId,
        type: "achievement",
        message: `Achievement unlocked: ${d.title}`,
        metadata: { code: d.code, icon: d.icon, title: d.title },
      });
      newlyAwarded.push(d.code);
      publish("achievements", userId, {
        type: "achievement",
        code: d.code,
        title: d.title,
        description: d.description,
        icon: d.icon,
      });
    } catch {
      // Unique violation - already awarded by a concurrent process. Ignore.
    }
  }
  return { newlyAwarded };
}

export async function listAchievements(userId: string) {
  const rows = await db
    .select()
    .from(achievementsTable)
    .where(eq(achievementsTable.userId, userId))
    .orderBy(sql`awarded_at desc`);
  // Map DB columns -> frontend shape used by web + mobile clients:
  //   code -> key, awardedAt -> earnedAt
  // (kept the underlying DB column names stable for migrations).
  return rows.map((r) => ({
    key: r.code,
    title: r.title,
    description: r.description,
    icon: r.icon,
    earnedAt: r.awardedAt,
  }));
}
