import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";

const authState = vi.hoisted(() => ({ clerkId: null as string | null }));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: authState.clerkId }),
  clerkClient: {
    users: {
      getUser: vi.fn(async () => {
        throw new Error("clerk disabled in tests");
      }),
    },
  },
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import usersRouter from "../routes/users";
import agentRouter from "../routes/agent";
import { db, agentRateLimitsTable, soulTwinActionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";
import { checkAndIncrement } from "./rate-limit";

const app = makeApp(usersRouter, agentRouter);
const createdUserIds: string[] = [];
const createdRateLimitKeys: string[] = [];

afterAll(async () => {
  if (createdRateLimitKeys.length > 0) {
    await db.delete(agentRateLimitsTable).where(inArray(agentRateLimitsTable.key, createdRateLimitKeys)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("checkAndIncrement — daily cap behaviour", () => {
  it("returns allowed=true while under cap, allowed=false on the next call", async () => {
    const key = `test:${randomUUID()}`;
    createdRateLimitKeys.push(key);

    for (let i = 0; i < 3; i++) {
      const r = await checkAndIncrement(key, 3);
      expect(r.allowed).toBe(true);
    }
    const denied = await checkAndIncrement(key, 3);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetAt).toBeGreaterThan(Date.now());
  });

  it("resets bucket when the window has elapsed", async () => {
    const key = `test:${randomUUID()}`;
    createdRateLimitKeys.push(key);

    // Use a tiny window so the second call is always past the boundary.
    const tinyWindow = 1; // ms
    const first = await checkAndIncrement(key, 1, tinyWindow);
    expect(first.allowed).toBe(true);

    // Wait past the window so the bucket resets.
    await new Promise((r) => setTimeout(r, 5));
    const second = await checkAndIncrement(key, 1, tinyWindow);
    expect(second.allowed).toBe(true);
  });
});

describe("checkAndIncrement — calendar-day window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets at the next UTC midnight rather than 24h after the first action", async () => {
    const key = `test:${randomUUID()}`;
    createdRateLimitKeys.push(key);

    // Pin "now" to 23:30 UTC on a fixed Monday. The bucket's first call
    // stamps `windowStart` at 23:30 UTC; under a rolling 24h window the
    // counter would not reset until 23:30 UTC the next day.
    const monday2330Utc = Date.UTC(2026, 0, 5, 23, 30, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(monday2330Utc));

    // Exhaust a tiny cap of 2 inside the same calendar day.
    const first = await checkAndIncrement(key, 2, { windowMode: "calendar-day" });
    expect(first.allowed).toBe(true);
    const second = await checkAndIncrement(key, 2, { windowMode: "calendar-day" });
    expect(second.allowed).toBe(true);
    const denied = await checkAndIncrement(key, 2, { windowMode: "calendar-day" });
    expect(denied.allowed).toBe(false);
    // resetAt must point at the *next* UTC midnight, not 24h after first call.
    const nextMidnight = Date.UTC(2026, 0, 6, 0, 0, 0);
    expect(denied.resetAt).toBe(nextMidnight);

    // Advance to 00:30 UTC on Tuesday — only an hour later in wall-clock,
    // but the calendar day has rolled over, so the cap must reset.
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 6, 0, 30, 0)));
    const tuesdayFirst = await checkAndIncrement(key, 2, { windowMode: "calendar-day" });
    expect(tuesdayFirst.allowed).toBe(true);
    expect(tuesdayFirst.remaining).toBe(1);
  });

  it("keeps blocking inside the same UTC day even after 23h have passed", async () => {
    const key = `test:${randomUUID()}`;
    createdRateLimitKeys.push(key);

    // First call lands at 00:30 UTC.
    const day0030 = Date.UTC(2026, 1, 10, 0, 30, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(day0030));

    const first = await checkAndIncrement(key, 1, { windowMode: "calendar-day" });
    expect(first.allowed).toBe(true);

    // Same calendar day, 23h later. Rolling 24h would reset; calendar-day
    // must NOT — we're still inside the same UTC day.
    vi.setSystemTime(new Date(day0030 + 23 * 60 * 60 * 1000));
    const stillBlocked = await checkAndIncrement(key, 1, { windowMode: "calendar-day" });
    expect(stillBlocked.allowed).toBe(false);
  });
});

describe("POST /api/ai/soul-twin/agent/queue — returns 429 once the daily cap is hit", () => {
  it("returns 429 when the per-user daily cap is exhausted", async () => {
    const QUEUE_DAILY_LIMIT = 50;
    const caller = await createTestUser({ agentModeEnabled: true, agentConsentedAt: new Date() });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);

    // Pre-fill the persisted bucket to the cap. The route's checkAndIncrement
    // cold-loads from this row (the in-memory map is empty for our unique
    // per-test user), sees count >= max, and returns allowed=false.
    const key = `queue:${caller.id}`;
    createdRateLimitKeys.push(key);
    await db.insert(agentRateLimitsTable).values({
      key,
      count: QUEUE_DAILY_LIMIT,
      windowStart: new Date(),
    });

    authState.clerkId = caller.clerkId;

    const res = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });
    expect(res.status).toBe(429);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.toLowerCase()).toContain("limit");
    expect(res.body.resetAt).toBeTruthy();

    // No action should have been queued for this rejected request.
    const queued = await db
      .select()
      .from(soulTwinActionsTable)
      .where(eq(soulTwinActionsTable.userId, caller.id));
    expect(queued.length).toBe(0);
  });
});
