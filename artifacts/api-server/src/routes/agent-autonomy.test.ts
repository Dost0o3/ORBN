import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
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
import agentRouter from "./agent";
import {
  db,
  followsTable,
  postsTable,
  commentsTable,
  soulTwinActionsTable,
  agentRateLimitsTable,
} from "@workspace/db";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
} from "../test/test-helpers";

const app = makeApp(usersRouter, agentRouter);
const createdUserIds: string[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  // Drop persisted rate-limit rows for the users we created so a re-run
  // of the suite in the same DB doesn't start with the autonomy counter
  // already at the daily cap.
  if (createdUserIds.length > 0) {
    const keys = createdUserIds.flatMap((id) => [
      `autonomy:${id}`,
      `queue:${id}`,
    ]);
    await db
      .delete(agentRateLimitsTable)
      .where(inArray(agentRateLimitsTable.key, keys))
      .catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("POST /api/ai/soul-twin/agent/queue — autonomy auto-execute", () => {
  it("auto-executes a `follow` action: status=approved, executedAt stamped, follows row created", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);
    authState.clerkId = caller.clerkId;

    const res = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(caller.id);
    expect(res.body.kind).toBe("follow");
    // Autonomy contract: row is flipped to `approved` AND `executedAt` is
    // stamped. The status column doesn't gain a separate "executed" value —
    // by design (see agent-actions.ts), `executedAt != null` is the signal
    // that the real-world side-effect actually ran. Asserting both pins
    // that contract so a regression that drops the timestamp (or never
    // approves the row) is caught.
    expect(res.body.status).toBe("approved");
    expect(res.body.executedAt).toBeTruthy();
    expect(res.body.resolvedAt).toBeTruthy();

    // Persisted row matches the response (no client-only state).
    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, res.body.id),
    });
    expect(persisted?.status).toBe("approved");
    expect(persisted?.executedAt).toBeInstanceOf(Date);

    // Real-world side-effect actually landed: caller now follows target.
    const follow = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(follow).toBeDefined();
  });

  it("auto-executes a `comment` action: status=approved, executedAt stamped, comment row created", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const author = await createTestUser();
    createdUserIds.push(caller.id, author.id);

    // Seed a post on the *other* user so the comment has a real target and
    // we exercise the same `createCommentForPost` helper the user-driven
    // route uses (including the post-owner notification branch).
    const [post] = await db
      .insert(postsTable)
      .values({ authorId: author.id, content: "autonomy comment target" })
      .returning();

    authState.clerkId = caller.clerkId;
    const commentText = `auto-exec-${Date.now()}-${Math.random()}`;

    const res = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({
        kind: "comment",
        payload: { content: commentText },
        targetPostId: post.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("comment");
    // Same autonomy contract as `follow` above: status=approved with
    // executedAt populated is the canonical "ran for real" signal.
    expect(res.body.status).toBe("approved");
    expect(res.body.executedAt).toBeTruthy();

    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, res.body.id),
    });
    expect(persisted?.status).toBe("approved");
    expect(persisted?.executedAt).toBeInstanceOf(Date);

    // The comment side-effect actually landed in the comments table under
    // the caller's authorship on the seeded post.
    const comment = await db.query.commentsTable.findFirst({
      where: and(
        eq(commentsTable.postId, post.id),
        eq(commentsTable.authorId, caller.id),
        eq(commentsTable.content, commentText),
      ),
    });
    expect(comment).toBeDefined();

    // Cascade cleanup: deleting the author user will drop the post, which
    // cascades to the comment. We also ensure no stray match-by-content
    // comment lingers from a prior run with the same random suffix (paranoia).
    await db.delete(commentsTable).where(like(commentsTable.content, "auto-exec-%")).catch(() => {});
  });

  // Pin the AUTONOMY_DAILY_LIMIT contract: the 11th queued follow in a
  // single day must NOT auto-execute. A regression that bumps, removes,
  // or short-circuits the cap would let autonomy keep firing past 10
  // actions/day without anyone noticing.
  it("stops auto-executing once AUTONOMY_DAILY_LIMIT (10) is hit in the same day", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    createdUserIds.push(caller.id);
    authState.clerkId = caller.clerkId;

    // Pre-clear any persisted rate-limit row from a prior test run so this
    // user starts at count=0. The afterAll hook also clears it, but a
    // cross-suite leak would otherwise pre-exhaust the cap and produce
    // confusing failures.
    await db
      .delete(agentRateLimitsTable)
      .where(eq(agentRateLimitsTable.key, `autonomy:${caller.id}`))
      .catch(() => {});

    // 11 distinct follow targets — follows are unique per (follower,
    // following) pair, so we can't reuse the same target.
    const targets = await Promise.all(
      Array.from({ length: 11 }, () => createTestUser()),
    );
    for (const t of targets) createdUserIds.push(t.id);

    const responses: Array<{ status: number; body: { id: number; status: string; executedAt: string | null } }> = [];
    for (const t of targets) {
      const res = await request(app)
        .post("/api/ai/soul-twin/agent/queue")
        .send({ kind: "follow", payload: {}, targetUserId: t.id });
      responses.push({ status: res.status, body: res.body });
    }

    // Every queue insert returns 201 regardless of whether autonomy ran.
    for (const r of responses) expect(r.status).toBe(201);

    // First 10: auto-executed. status=approved + executedAt populated +
    // a real follows row inserted under (caller -> target_i).
    for (let i = 0; i < 10; i++) {
      expect(responses[i].body.status).toBe("approved");
      expect(responses[i].body.executedAt).toBeTruthy();

      const persisted = await db.query.soulTwinActionsTable.findFirst({
        where: eq(soulTwinActionsTable.id, responses[i].body.id),
      });
      expect(persisted?.status).toBe("approved");
      expect(persisted?.executedAt).toBeInstanceOf(Date);

      const follow = await db.query.followsTable.findFirst({
        where: and(
          eq(followsTable.followerId, caller.id),
          eq(followsTable.followingId, targets[i].id),
        ),
      });
      expect(follow).toBeDefined();
    }

    // 11th: cap reached → action stays pending, no follow row created.
    expect(responses[10].body.status).toBe("pending");
    expect(responses[10].body.executedAt).toBeNull();

    const eleventhPersisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, responses[10].body.id),
    });
    expect(eleventhPersisted?.status).toBe("pending");
    expect(eleventhPersisted?.executedAt).toBeNull();

    const eleventhFollow = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, targets[10].id),
      ),
    });
    expect(eleventhFollow).toBeUndefined();
  });

  // Pin the "release-the-claim on failure" branch in
  // `executeApprovedAction`: when the side effect throws, the row's
  // `executedAt` must be cleared back to NULL so the row is retryable
  // (status stays `approved` for the audit trail). A regression that
  // dropped the catch/finally release would silently leave executedAt
  // stamped on a failed run, making it look "sent" when nothing
  // actually happened.
  it("leaves a failed autonomous comment as approved with executedAt=null and no comment row", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    createdUserIds.push(caller.id);
    authState.clerkId = caller.clerkId;

    // Force the executor's `createCommentForPost` to throw "Target post
    // not found" by pointing at an id that cannot exist. `targetPostId`
    // has no FK constraint (see lib/db/src/schema/soul-twin.ts), so the
    // queue insert succeeds and the failure happens inside the side
    // effect — exactly the path the catch branch is meant to cover.
    const bogusPostId = 2_147_483_000; // near int32 max, vanishingly unlikely to collide
    const commentText = `auto-fail-${Date.now()}-${Math.random()}`;

    const res = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({
        kind: "comment",
        payload: { content: commentText },
        targetPostId: bogusPostId,
      });

    // Queue creation itself still succeeds (the failure is swallowed by
    // maybeAutoExecute so it doesn't block the user from queueing more).
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("comment");
    // The audit row is left in `approved` status (so the user sees the
    // agent did intend to act) but with `executedAt` released back to
    // NULL — the canonical "approved-but-failed, please retry" shape.
    expect(res.body.status).toBe("approved");
    expect(res.body.executedAt).toBeNull();

    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, res.body.id),
    });
    expect(persisted?.status).toBe("approved");
    expect(persisted?.executedAt).toBeNull();
    // resolvedAt is set when maybeAutoExecute approves the row, which
    // happens before the failing execution attempt — so it stays
    // populated even though executedAt was released.
    expect(persisted?.resolvedAt).toBeInstanceOf(Date);

    // Hard side-effect guarantee: no comment row was inserted. We match
    // by the unique `commentText` so a parallel run with a different
    // suffix can't false-positive this assertion.
    const stray = await db.query.commentsTable.findFirst({
      where: and(
        eq(commentsTable.authorId, caller.id),
        eq(commentsTable.content, commentText),
      ),
    });
    expect(stray).toBeUndefined();

    // Paranoia cleanup so a future run never sees lingering state from
    // a flaky abort.
    await db.delete(commentsTable).where(like(commentsTable.content, "auto-fail-%")).catch(() => {});
  });
});
