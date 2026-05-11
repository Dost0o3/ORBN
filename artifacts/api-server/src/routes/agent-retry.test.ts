import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";

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

import {
  db,
  followsTable,
  postsTable,
  soulTwinActionsTable,
} from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import { createTestUser, deleteTestUsers } from "../test/test-helpers";
import { runAgentRetrySweep } from "../lib/agent-retry";
import { MAX_ATTEMPTS } from "../lib/agent-actions";

const createdUserIds: string[] = [];
const seededActionIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  if (seededActionIds.length > 0) {
    await db
      .delete(soulTwinActionsTable)
      .where(eq(soulTwinActionsTable.id, seededActionIds[0]!))
      .catch(() => {});
    // Bulk-delete the rest by per-id (cheap in tests, avoids inArray import).
    for (const id of seededActionIds.slice(1)) {
      await db.delete(soulTwinActionsTable).where(eq(soulTwinActionsTable.id, id)).catch(() => {});
    }
  }
  await deleteTestUsers(createdUserIds);
});

/**
 * These tests exercise `runAgentRetrySweep` directly (no HTTP layer) so we
 * can drive the time-based candidate selection deterministically by
 * back-dating `lastAttemptAt`. The sweep is the only place where:
 *
 *   1. attemptCount-aware backoff is enforced
 *   2. status flips from "approved" → "failed" once MAX_ATTEMPTS is exhausted
 *
 * Both behaviors are load-bearing for the autonomy story (a permanently
 * broken row can't loop forever, a transient blip gets a fresh try), so
 * regressions here would silently degrade the agent.
 */
describe("agent retry sweep", () => {
  it("flips status to 'failed' once MAX_ATTEMPTS is exhausted on the next retry", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentConsentedAt: new Date(),
    });
    const author = await createTestUser();
    createdUserIds.push(caller.id, author.id);

    const [post] = await db
      .insert(postsTable)
      .values({ authorId: author.id, content: "retry-target" })
      .returning();

    // Seed a row already at attemptCount = MAX_ATTEMPTS - 1 with a
    // back-dated lastAttemptAt so the per-attempt backoff is satisfied.
    // Use an invalid post id in the payload to guarantee the next attempt
    // throws inside `createCommentFromAction`.
    const longAgo = new Date(Date.now() - 60 * 60_000); // 1 hour ago
    const [seeded] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: caller.id,
        kind: "comment",
        status: "approved",
        payload: { content: `retry-give-up-${Date.now()}` },
        targetPostId: 0x7fffffff, // bogus → createCommentFromAction throws
        executedAt: null,
        attemptCount: MAX_ATTEMPTS - 1,
        lastAttemptAt: longAgo,
        resolvedAt: longAgo,
      })
      .returning();
    seededActionIds.push(seeded.id);

    const result = await runAgentRetrySweep();

    expect(result.candidateCount).toBeGreaterThanOrEqual(1);
    expect(result.gaveUpCount).toBeGreaterThanOrEqual(1);

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, seeded.id),
    });
    // Cap exhausted: row is permanently failed, attemptCount bumped to
    // MAX_ATTEMPTS, error message captured for the UI.
    expect(after?.status).toBe("failed");
    expect(after?.attemptCount).toBe(MAX_ATTEMPTS);
    expect(after?.executedAt).toBeNull();
    expect(after?.lastError).toBeTruthy();

    // Cleanup post (cascade also drops nothing since the comment never landed).
    await db.delete(postsTable).where(eq(postsTable.id, post.id)).catch(() => {});
  });

  it("re-runs the side effect for an approved row whose backoff has elapsed but cap isn't reached", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);

    const longAgo = new Date(Date.now() - 60 * 60_000);
    const [seeded] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: caller.id,
        kind: "follow",
        status: "approved",
        payload: {},
        targetUserId: target.id,
        executedAt: null,
        attemptCount: 1,
        lastAttemptAt: longAgo,
        resolvedAt: longAgo,
      })
      .returning();
    seededActionIds.push(seeded.id);

    const result = await runAgentRetrySweep();
    expect(result.succeededCount).toBeGreaterThanOrEqual(1);

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, seeded.id),
    });
    // Successful retry: executedAt stamped, attemptCount bumped, status
    // remains "approved" (status="failed" is reserved for give-up).
    expect(after?.status).toBe("approved");
    expect(after?.attemptCount).toBe(2);
    expect(after?.executedAt).toBeInstanceOf(Date);

    // Real-world side effect actually landed: caller now follows target.
    const follow = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(follow).toBeDefined();
  });

  it("retries legacy rows where lastAttemptAt is NULL but resolvedAt is old enough", async () => {
    // Pre-migration rows (or rows whose initial maybeAutoExecute crashed
    // before stamping an attempt) sit at attemptCount=0 with
    // lastAttemptAt=NULL. The sweep must still pick them up so a
    // user's stuck approved-but-never-ran row eventually gets
    // re-attempted instead of staying stuck forever.
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);

    const longAgo = new Date(Date.now() - 60 * 60_000);
    const [seeded] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: caller.id,
        kind: "follow",
        status: "approved",
        payload: {},
        targetUserId: target.id,
        executedAt: null,
        attemptCount: 0,
        lastAttemptAt: null,
        resolvedAt: longAgo,
      })
      .returning();
    seededActionIds.push(seeded.id);

    const result = await runAgentRetrySweep();
    expect(result.succeededCount).toBeGreaterThanOrEqual(1);

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, seeded.id),
    });
    // Legacy row got its first real attempt: attemptCount goes 0 → 1,
    // executedAt stamped, side effect actually landed.
    expect(after?.attemptCount).toBe(1);
    expect(after?.executedAt).toBeInstanceOf(Date);
    expect(after?.status).toBe("approved");

    const follow = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(follow).toBeDefined();
  });

  it("ignores rows whose per-attempt backoff has not yet elapsed", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);

    // attemptCount=1 with lastAttemptAt=10s ago → required backoff is
    // RETRY_BACKOFF_MS[0] = 60_000ms, which has NOT elapsed. The sweep
    // must leave this row untouched so we don't burn through retry
    // budget faster than the backoff schedule allows.
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    const [seeded] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: caller.id,
        kind: "follow",
        status: "approved",
        payload: {},
        targetUserId: target.id,
        executedAt: null,
        attemptCount: 1,
        lastAttemptAt: tenSecondsAgo,
        resolvedAt: tenSecondsAgo,
      })
      .returning();
    seededActionIds.push(seeded.id);

    await runAgentRetrySweep();

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, seeded.id),
    });
    // Row is untouched: same attemptCount, same lastAttemptAt timestamp.
    expect(after?.attemptCount).toBe(1);
    expect(after?.lastAttemptAt?.getTime()).toBe(tenSecondsAgo.getTime());
    expect(after?.status).toBe("approved");
    expect(after?.executedAt).toBeNull();

    // Defensive: no follow row was created either.
    const follow = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(follow).toBeUndefined();
  });
});

afterAll(async () => {
  // Stray content-match cleanup in case other suites add comments with the
  // same prefix; cheap belt-and-braces.
  const { commentsTable } = await import("@workspace/db");
  await db.delete(commentsTable).where(like(commentsTable.content, "retry-give-up-%")).catch(() => {});
});
