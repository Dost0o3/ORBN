import { db, agentRateLimitsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Window strategy for a rate-limit bucket.
 *
 * - `"rolling"`: classic rolling window of `windowMs` milliseconds. The
 *   bucket resets `windowMs` after the *first* action in the run, regardless
 *   of wall-clock day boundaries.
 * - `"calendar-day"`: bucket resets at the next UTC midnight. This is what
 *   most users expect when product copy says "daily cap" — the counter
 *   visibly resets when the calendar day rolls over rather than 24h after
 *   their first action of the day. `windowMs` is ignored in this mode.
 */
export type RateLimitWindowMode = "rolling" | "calendar-day";

export interface RateLimitOptions {
  windowMs?: number;
  windowMode?: RateLimitWindowMode;
}

/**
 * UTC midnight at the start of the day containing `now`. Keying off UTC
 * (rather than per-user TZ) keeps the bucket math timezone-free; the
 * trade-off is that a user in UTC-8 sees their counter reset at 16:00
 * local rather than 00:00 local. Acceptable for a 10/day autonomy cap —
 * the alternative requires plumbing a per-user timezone preference end
 * to end, which we don't store today.
 */
function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function nextUtcMidnight(now: number): number {
  return startOfUtcDay(now) + DAY_MS;
}

async function loadFromDb(key: string): Promise<Bucket | null> {
  const row = await db
    .select()
    .from(agentRateLimitsTable)
    .where(eq(agentRateLimitsTable.key, key))
    .limit(1);
  if (!row[0]) return null;
  return { count: row[0].count, windowStart: row[0].windowStart.getTime() };
}

async function persist(key: string, bucket: Bucket): Promise<void> {
  await db
    .insert(agentRateLimitsTable)
    .values({
      key,
      count: bucket.count,
      windowStart: new Date(bucket.windowStart),
    })
    .onConflictDoUpdate({
      target: agentRateLimitsTable.key,
      set: {
        count: bucket.count,
        windowStart: new Date(bucket.windowStart),
      },
    });
}

/**
 * Returns true if the given bucket is still within its current window
 * under the chosen mode. For `"calendar-day"`, the bucket is considered
 * stale as soon as `windowStart` falls before the start of today's UTC
 * day — i.e. the calendar day has rolled over.
 */
function isBucketLive(bucket: Bucket, now: number, mode: RateLimitWindowMode, windowMs: number): boolean {
  if (mode === "calendar-day") {
    return bucket.windowStart >= startOfUtcDay(now);
  }
  return now - bucket.windowStart <= windowMs;
}

function resetAtFor(now: number, windowStart: number, mode: RateLimitWindowMode, windowMs: number): number {
  return mode === "calendar-day" ? nextUtcMidnight(now) : windowStart + windowMs;
}

/**
 * Daily rate limit. Persists to `agent_rate_limits` so a server restart
 * cannot reset the cap, and uses an in-memory bucket as a fast path between
 * requests. Atomic-ish via DB upsert; in-memory cache is best-effort and
 * may briefly under-count under high concurrency on first cold call.
 */
export async function checkAndIncrement(
  key: string,
  max: number,
  options: RateLimitOptions | number = {},
): Promise<RateLimitResult> {
  // Back-compat: callers used to pass `windowMs` as a positional number.
  const opts: RateLimitOptions = typeof options === "number" ? { windowMs: options } : options;
  const windowMs = opts.windowMs ?? DAY_MS;
  const mode: RateLimitWindowMode = opts.windowMode ?? "rolling";
  const now = Date.now();
  let bucket = buckets.get(key);

  // Cold-start path: load persisted bucket from DB the first time we see this key
  // (or after the in-memory map was cleared by a restart).
  if (!bucket) {
    const dbBucket = await loadFromDb(key);
    if (dbBucket) bucket = dbBucket;
  }

  if (!bucket || !isBucketLive(bucket, now, mode, windowMs)) {
    const fresh: Bucket = { count: 1, windowStart: now };
    buckets.set(key, fresh);
    await persist(key, fresh).catch(() => {});
    return { allowed: true, remaining: max - 1, resetAt: resetAtFor(now, now, mode, windowMs) };
  }

  if (bucket.count >= max) {
    return { allowed: false, remaining: 0, resetAt: resetAtFor(now, bucket.windowStart, mode, windowMs) };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  // Use SQL increment so concurrent callers don't clobber each other.
  await db
    .update(agentRateLimitsTable)
    .set({ count: sql`${agentRateLimitsTable.count} + 1` })
    .where(eq(agentRateLimitsTable.key, key))
    .catch(() => {});
  return {
    allowed: true,
    remaining: max - bucket.count,
    resetAt: resetAtFor(now, bucket.windowStart, mode, windowMs),
  };
}

export async function peek(
  key: string,
  max: number,
  options: RateLimitOptions | number = {},
): Promise<RateLimitResult> {
  const opts: RateLimitOptions = typeof options === "number" ? { windowMs: options } : options;
  const windowMs = opts.windowMs ?? DAY_MS;
  const mode: RateLimitWindowMode = opts.windowMode ?? "rolling";
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    const dbBucket = await loadFromDb(key);
    if (dbBucket) bucket = dbBucket;
  }
  if (!bucket || !isBucketLive(bucket, now, mode, windowMs)) {
    return { allowed: true, remaining: max, resetAt: resetAtFor(now, now, mode, windowMs) };
  }
  return {
    allowed: bucket.count < max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: resetAtFor(now, bucket.windowStart, mode, windowMs),
  };
}
