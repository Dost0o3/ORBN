import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, followsTable, postsTable, likesTable, bountySubmissionsTable, communityMembersTable, powerScoreSnapshotsTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { buildUserProfile, getPowerScore } from "./users";

const router = Router();

const insightCache = new Map<string, { insight: string; ts: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

async function getInsight(userId: string, displayName: string, skills: string[]): Promise<string> {
  const cached = insightCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.insight;

  const fallbacks = [
    `${displayName} is dominating the conversation with breakout engagement this week.`,
    `${displayName}'s content is hitting differently — network is taking notice.`,
    `The algorithm is watching ${displayName}. Rapid follower growth suggests a breakout moment.`,
    `${displayName} is building real momentum. Skills in ${skills.slice(0, 2).join(" & ") || "their field"} are turning heads.`,
    `Quiet power. ${displayName} is rising through quality, not noise.`,
    `${displayName} went from background to front-page in one week. Watch this one.`,
    `Community engagement off the charts for ${displayName}. The kind of growth that compounds.`,
    `${displayName} is playing the long game and winning — velocity is undeniable.`,
  ];

  const deterministicFallback = () => {
    const hash = userId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return fallbacks[hash % fallbacks.length];
  };

  try {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const prompt = `In exactly one punchy sentence (max 15 words), explain why ${displayName} (skills: ${skills.join(", ") || "professional"}) is trending up on a professional network this week. Be direct, powerful, no fluff.`;
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
    });
    const insight = res.choices[0]?.message?.content?.trim() ?? deterministicFallback();
    insightCache.set(userId, { insight, ts: Date.now() });
    return insight;
  } catch {
    const insight = deterministicFallback();
    insightCache.set(userId, { insight, ts: Date.now() });
    return insight;
  }
}

router.get("/leaderboard/dark-horses", async (_req, res): Promise<void> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const velocityRows = await db.execute(sql`
    SELECT
      u.id,
      COALESCE(new_f.cnt, 0) * 5
        + COALESCE(recent_l.cnt, 0) * 2
        + COALESCE(recent_b.cnt, 0) * 20
        + COALESCE(recent_cm.cnt, 0) * 8
        AS velocity,
      COALESCE(new_f.cnt, 0)                        AS new_follows,
      COALESCE(total_f.cnt, 0)                       AS total_follows
    FROM users u
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt FROM follows
      WHERE following_id = u.id AND created_at >= ${sevenDaysAgo}
    ) new_f ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt FROM likes lk
      JOIN posts p ON p.id = lk.post_id
      WHERE p.author_id = u.id AND lk.created_at >= ${sevenDaysAgo}
    ) recent_l ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt FROM bounty_submissions
      WHERE submitter_id = u.id AND is_winner = true AND created_at >= ${sevenDaysAgo}
    ) recent_b ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt FROM community_members
      WHERE user_id = u.id AND joined_at >= ${sevenDaysAgo}
    ) recent_cm ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt FROM follows
      WHERE following_id = u.id
    ) total_f ON true
    ORDER BY velocity DESC
    LIMIT 10
  `);

  const topIds = (velocityRows.rows as Array<{ id: string; velocity: number; new_follows: number; total_follows: number }>);

  const top10 = topIds;

  const horses = await Promise.all(top10.map(async (row, idx) => {
    const newF = Number(row.new_follows ?? 0);
    const totalF = Number(row.total_follows ?? 0);
    const prevTotal = Math.max(1, totalF - newF);
    const growthPercent = Math.round((newF / prevTotal) * 100);

    const userRow = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, row.id) });
    if (!userRow) return null;
    const [profile, { score: powerScore }] = await Promise.all([
      buildUserProfile(userRow),
      getPowerScore(userRow.id),
    ]);
    const insight = await getInsight(userRow.id, userRow.displayName, Array.isArray(userRow.skills) ? userRow.skills : []);
    return {
      rank: idx + 1,
      user: profile,
      powerScore,
      growthPercent,
      insight,
    };
  }));

  const filteredHorses = horses.filter(Boolean);

  res.json({ horses: filteredHorses, updatedAt: new Date().toISOString() });
});

router.get("/leaderboard/operator-of-the-week", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Use snapshot delta (current cached score - oldest snapshot in last 7d).
  const rows = await db.execute(sql`
    WITH snaps AS (
      SELECT
        u.id,
        u.power_score_cached AS current_score,
        (
          SELECT score FROM power_score_snapshots
          WHERE user_id = u.id AND created_at >= ${sevenDaysAgo}
          ORDER BY created_at ASC LIMIT 1
        ) AS oldest_score
      FROM users u
      WHERE u.power_score_cached IS NOT NULL
    )
    SELECT id, current_score, COALESCE(oldest_score, current_score) AS baseline,
           current_score - COALESCE(oldest_score, current_score) AS delta
    FROM snaps
    WHERE current_score IS NOT NULL
    ORDER BY delta DESC, current_score DESC
    LIMIT 3
  `);

  const top = rows.rows as Array<{ id: string; current_score: number; baseline: number; delta: number }>;

  const operators = await Promise.all(
    top.map(async (row, idx) => {
      const userRow = await db.query.usersTable.findFirst({ where: eq(usersTable.id, row.id) });
      if (!userRow) return null;
      const profile = await buildUserProfile(userRow);
      const delta = Number(row.delta ?? 0);
      return {
        rank: idx + 1,
        user: profile,
        powerScore: Number(row.current_score ?? 0),
        // Both keys are returned so web/mobile clients (which read `deltaScore`) and any
        // future consumers (which read `weeklyDelta`) all work without a coordinated change.
        deltaScore: delta,
        weeklyDelta: delta,
      };
    })
  );

  const filtered = operators.filter(Boolean);
  res.json({
    operator: filtered[0] ?? null,
    operators: filtered,
    updatedAt: new Date().toISOString(),
  });
});

export default router;
