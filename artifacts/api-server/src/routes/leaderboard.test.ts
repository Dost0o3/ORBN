import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";

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

import usersRouter from "./users";
import leaderboardRouter from "./leaderboard";
import { db, powerScoreSnapshotsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

const app = makeApp(usersRouter, leaderboardRouter);
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // Snapshots cascade-delete with users, but be explicit just in case.
    await db.delete(powerScoreSnapshotsTable).where(inArray(powerScoreSnapshotsTable.userId, createdUserIds)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("GET /api/leaderboard/operator-of-the-week — response shape", () => {
  it("returns operator (single), operators (array), with deltaScore + weeklyDelta on every entry", async () => {
    // Create one anchor user with a deliberately huge weekly delta so it's
    // virtually guaranteed to land in the top-3, regardless of what other
    // power-score data may already live in the dev DB.
    const anchor = await createTestUser({
      powerScoreCached: 999,
      powerRankCached: "THE DON",
      powerScoreCachedAt: new Date(),
      agentModeEnabled: false,
    });
    createdUserIds.push(anchor.id);

    // Snapshot from 6 days ago at score=1 → delta = 999 - 1 = 998.
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    await db.insert(powerScoreSnapshotsTable).values({
      userId: anchor.id,
      score: 1,
      rank: "RECRUIT",
      breakdown: {},
      createdAt: sixDaysAgo,
    });

    // Authenticate as the anchor user (the route requires auth).
    authState.clerkId = anchor.clerkId;

    const res = await request(app).get("/api/leaderboard/operator-of-the-week");
    expect(res.status).toBe(200);

    // Contract: BOTH `operator` (single) and `operators` (array) keys exist.
    expect(res.body).toHaveProperty("operator");
    expect(res.body).toHaveProperty("operators");
    expect(Array.isArray(res.body.operators)).toBe(true);
    expect(res.body.operators.length).toBeGreaterThan(0);

    // operator (single) === operators[0] (the bug fix — clients can read either).
    expect(res.body.operator).toEqual(res.body.operators[0]);

    // Every operator entry must carry BOTH `deltaScore` AND `weeklyDelta`,
    // and they must be numerically identical.
    for (const op of res.body.operators) {
      expect(typeof op.deltaScore).toBe("number");
      expect(typeof op.weeklyDelta).toBe("number");
      expect(op.deltaScore).toBe(op.weeklyDelta);
      expect(typeof op.powerScore).toBe("number");
      expect(op.user).toBeTruthy();
      expect(op.user.id).toBeTruthy();
    }

    // Our anchor user — with delta=998 — should be at #1 and have the
    // expected delta value plumbed into both keys.
    const top = res.body.operators[0];
    expect(top.user.id).toBe(anchor.id);
    expect(top.deltaScore).toBe(998);
    expect(top.weeklyDelta).toBe(998);
    expect(top.powerScore).toBe(999);
  });
});
