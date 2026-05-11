import { db } from "@workspace/db";
import { dailyStreaksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { publish } from "./sse-bus";

// Spec: a streak only breaks after 36h of inactivity, not at midnight UTC.
// This gives users a real-time grace period instead of resetting their streak
// at a clock boundary regardless of whether they were just active hours ago.
const STREAK_GRACE_MS = 36 * 60 * 60 * 1000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  changed: boolean;
}

export async function updateStreak(userId: string): Promise<StreakResult> {
  const now = new Date();
  const today = todayUtc();
  const existing = await db.query.dailyStreaksTable.findFirst({ where: eq(dailyStreaksTable.userId, userId) });

  if (!existing) {
    await db.insert(dailyStreaksTable).values({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: today,
    });
    const r: StreakResult = { currentStreak: 1, longestStreak: 1, lastActiveDate: today, changed: true };
    publish("streak", userId, { type: "streak", ...r });
    return r;
  }

  const last = existing.lastActiveDate ?? today;
  let next = existing.currentStreak;
  let longest = existing.longestStreak;
  let changed = false;

  // Same calendar day: streak count already reflects today, but we must
  // still advance `updatedAt` so it tracks the user's *true* last activity.
  // Otherwise the 36h grace check below (which reads `updatedAt`) would
  // measure from the first action of the previous day rather than the
  // most recent one and could reset the streak incorrectly.
  if (last === today) {
    await db
      .update(dailyStreaksTable)
      .set({ updatedAt: now })
      .where(eq(dailyStreaksTable.userId, userId));
    return {
      currentStreak: existing.currentStreak,
      longestStreak: existing.longestStreak,
      lastActiveDate: last,
      changed: false,
    };
  }

  // Different calendar day. Use elapsed wall-clock time since the last
  // mutation (`updatedAt`) to decide continue-vs-reset, so a user active at
  // 23:00 yesterday and 02:00 today (3h gap) keeps their streak even though
  // those are different UTC dates.
  const elapsedMs = now.getTime() - existing.updatedAt.getTime();
  if (elapsedMs <= STREAK_GRACE_MS) {
    next = existing.currentStreak + 1;
    longest = Math.max(longest, next);
    changed = true;
  } else {
    next = 1;
    changed = true;
  }

  await db
    .update(dailyStreaksTable)
    .set({ currentStreak: next, longestStreak: longest, lastActiveDate: today, updatedAt: now })
    .where(eq(dailyStreaksTable.userId, userId));

  const r: StreakResult = { currentStreak: next, longestStreak: longest, lastActiveDate: today, changed };
  if (changed) publish("streak", userId, { type: "streak", ...r });
  return r;
}

export async function getStreak(userId: string): Promise<{ currentStreak: number; longestStreak: number; lastActiveDate: string | null }> {
  const row = await db.query.dailyStreaksTable.findFirst({ where: eq(dailyStreaksTable.userId, userId) });
  return {
    currentStreak: row?.currentStreak ?? 0,
    longestStreak: row?.longestStreak ?? 0,
    lastActiveDate: row?.lastActiveDate ?? null,
  };
}
