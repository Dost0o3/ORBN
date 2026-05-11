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
  directMessagesTable,
  notificationsTable,
  soulTwinActionsTable,
  agentRateLimitsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { subscribe } from "../lib/sse-bus";
import type { Response } from "express";

/**
 * Subscribe to a per-user SSE channel and parse `data: <json>\n\n` frames
 * back into typed events so a test can assert on what undoExecutedAction
 * broadcast. Mirrors the captureReadEvents helper in the
 * messages-read-receipts test.
 */
function captureSseEvents<T = Record<string, unknown>>(
  channel: "dm-inbox" | "feed",
  userId: string,
): { events: T[]; unsubscribe: () => void } {
  const events: T[] = [];
  const fakeRes = {
    write(chunk: string): boolean {
      const m = chunk.match(/^data: (.*)\n\n$/s);
      if (m) {
        try { events.push(JSON.parse(m[1]) as T); } catch { /* ignore */ }
      }
      return true;
    },
  } as unknown as Response;
  const unsubscribe = subscribe(channel, userId, fakeRes);
  return { events, unsubscribe };
}
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
  if (createdUserIds.length > 0) {
    const keys = createdUserIds.flatMap((id) => [
      `autonomy:${id}`,
      `queue:${id}`,
      `undo:${id}`,
    ]);
    await db
      .delete(agentRateLimitsTable)
      .where(inArray(agentRateLimitsTable.key, keys))
      .catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("POST /api/ai/soul-twin/agent/executed/:actionId/undo", () => {
  it("undoes a follow: deletes the follows row and stamps revertedAt on the action", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);
    authState.clerkId = caller.clerkId;

    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });
    expect(queueRes.status).toBe(201);
    expect(queueRes.body.executedAt).toBeTruthy();
    const actionId = queueRes.body.id as number;

    // Side-effect landed.
    const before = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(before).toBeDefined();

    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.success).toBe(true);
    expect(undoRes.body.reverted).toBe(true);
    expect(undoRes.body.kind).toBe("follow");

    // Follow row gone.
    const after = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, caller.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(after).toBeUndefined();

    // Action payload now has revertedAt; row is otherwise preserved as audit.
    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, actionId),
    });
    expect(persisted?.executedAt).toBeInstanceOf(Date);
    const payload = persisted?.payload as Record<string, unknown> | null | undefined;
    expect(typeof payload?.revertedAt).toBe("string");

    // Idempotent: a second undo is a 200 no-op.
    const undoRes2 = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes2.status).toBe(200);
    expect(undoRes2.body.reverted).toBe(false);
  });

  it("undoes a comment: deletes the comment and the post-owner notification", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const author = await createTestUser();
    createdUserIds.push(caller.id, author.id);

    const [post] = await db
      .insert(postsTable)
      .values({ authorId: author.id, content: "undo target post" })
      .returning();

    authState.clerkId = caller.clerkId;
    const text = `undo-comment-${Date.now()}-${Math.random()}`;
    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "comment", payload: { content: text }, targetPostId: post.id });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;

    const commentBefore = await db.query.commentsTable.findFirst({
      where: and(eq(commentsTable.postId, post.id), eq(commentsTable.authorId, caller.id)),
    });
    expect(commentBefore).toBeDefined();

    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(200);

    const commentAfter = await db.query.commentsTable.findFirst({
      where: and(eq(commentsTable.postId, post.id), eq(commentsTable.authorId, caller.id)),
    });
    expect(commentAfter).toBeUndefined();
  });

  it("undoes a post: deletes the published post", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    createdUserIds.push(caller.id);
    authState.clerkId = caller.clerkId;

    const content = `undo-post-${Date.now()}-${Math.random()}`;
    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "post", payload: { content } });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;
    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, actionId),
    });
    const payload = persisted?.payload as Record<string, unknown> | null;
    const postId = payload?.resultPostId as number;
    expect(typeof postId).toBe("number");

    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(200);

    const postAfter = await db.query.postsTable.findFirst({
      where: eq(postsTable.id, postId),
    });
    expect(postAfter).toBeUndefined();
  });

  it("undoes a DM: deletes the message", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const recipient = await createTestUser();
    createdUserIds.push(caller.id, recipient.id);
    authState.clerkId = caller.clerkId;

    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({
        kind: "dm",
        payload: { content: "hello from soul twin" },
        targetUserId: recipient.id,
      });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;
    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, actionId),
    });
    const payload = persisted?.payload as Record<string, unknown> | null;
    const messageId = payload?.resultMessageId as number;
    expect(typeof messageId).toBe("number");

    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(200);

    const msgAfter = await db.query.directMessagesTable.findFirst({
      where: eq(directMessagesTable.id, messageId),
    });
    expect(msgAfter).toBeUndefined();
  });

  it("publishes a dm-inbox `unsent` event to BOTH the recipient and the sender on DM undo", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const recipient = await createTestUser();
    createdUserIds.push(caller.id, recipient.id);
    authState.clerkId = caller.clerkId;

    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({
        kind: "dm",
        payload: { content: "soul twin retract me" },
        targetUserId: recipient.id,
      });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;
    const persisted = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, actionId),
    });
    const messageId = (persisted?.payload as { resultMessageId?: number } | null)
      ?.resultMessageId as number;
    expect(typeof messageId).toBe("number");

    const recipientStream = captureSseEvents<{ type: string; messageId?: number; conversationId?: number }>("dm-inbox", recipient.id);
    const senderStream = captureSseEvents<{ type: string; messageId?: number; conversationId?: number }>("dm-inbox", caller.id);
    try {
      const undoRes = await request(app)
        .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
        .send();
      expect(undoRes.status).toBe(200);
    } finally {
      recipientStream.unsubscribe();
      senderStream.unsubscribe();
    }

    const recipientUnsent = recipientStream.events.find((e) => e.type === "unsent");
    const senderUnsent = senderStream.events.find((e) => e.type === "unsent");
    expect(recipientUnsent).toBeDefined();
    expect(recipientUnsent?.messageId).toBe(messageId);
    expect(typeof recipientUnsent?.conversationId).toBe("number");
    expect(senderUnsent).toBeDefined();
    expect(senderUnsent?.messageId).toBe(messageId);
  });

  it("publishes a feed `comment-removed` event to the post owner on comment undo", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const author = await createTestUser();
    createdUserIds.push(caller.id, author.id);
    const [post] = await db
      .insert(postsTable)
      .values({ authorId: author.id, content: "comment-removed sse target" })
      .returning();

    authState.clerkId = caller.clerkId;
    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({
        kind: "comment",
        payload: { content: `sse-undo-${Date.now()}` },
        targetPostId: post.id,
      });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;
    const insertedComment = await db.query.commentsTable.findFirst({
      where: and(eq(commentsTable.postId, post.id), eq(commentsTable.authorId, caller.id)),
    });
    expect(insertedComment).toBeDefined();
    const expectedCommentId = insertedComment!.id;

    const ownerStream = captureSseEvents<{ type: string; postId?: number; commentId?: number }>("feed", author.id);
    const callerStream = captureSseEvents<{ type: string; postId?: number; commentId?: number }>("feed", caller.id);
    try {
      const undoRes = await request(app)
        .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
        .send();
      expect(undoRes.status).toBe(200);
    } finally {
      ownerStream.unsubscribe();
      callerStream.unsubscribe();
    }

    const ownerEv = ownerStream.events.find((e) => e.type === "comment-removed");
    expect(ownerEv).toBeDefined();
    expect(ownerEv?.postId).toBe(post.id);
    expect(ownerEv?.commentId).toBe(expectedCommentId);
    // The commenter's own tabs also get the event so any open feed view
    // they have on the same post drops the row too.
    const callerEv = callerStream.events.find((e) => e.type === "comment-removed");
    expect(callerEv).toBeDefined();
    expect(callerEv?.commentId).toBe(expectedCommentId);
  });

  it("rejects undo after the grace window has elapsed (410)", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);
    authState.clerkId = caller.clerkId;

    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;

    // Backdate executedAt past the grace window so the route's age check fails.
    await db
      .update(soulTwinActionsTable)
      .set({ executedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(soulTwinActionsTable.id, actionId));

    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(410);
  });

  it("flips the matching notification metadata entry to reverted=true", async () => {
    const caller = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);
    authState.clerkId = caller.clerkId;

    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;

    // Autonomy auto-execute should have inserted an agent_executed
    // notification whose metadata.actions[] includes this action.
    const beforeNotif = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, caller.id),
        eq(notificationsTable.type, "agent_executed"),
      ),
      orderBy: desc(notificationsTable.createdAt),
    });
    expect(beforeNotif).toBeDefined();
    const beforeMeta = beforeNotif!.metadata as { actions: Array<{ actionId: number; reverted?: boolean }> };
    const beforeEntry = beforeMeta.actions.find((a) => a.actionId === actionId);
    expect(beforeEntry).toBeDefined();
    expect(beforeEntry!.reverted).not.toBe(true);

    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(200);

    // The same metadata entry is now flagged reverted, so the UI can
    // swap the Undo button for the "Reverted" badge without re-fetching
    // anything beyond the notifications list.
    const afterNotif = await db.query.notificationsTable.findFirst({
      where: eq(notificationsTable.id, beforeNotif!.id),
    });
    const afterMeta = afterNotif!.metadata as { actions: Array<{ actionId: number; reverted?: boolean; revertedAt?: string }> };
    const afterEntry = afterMeta.actions.find((a) => a.actionId === actionId);
    expect(afterEntry?.reverted).toBe(true);
    expect(typeof afterEntry?.revertedAt).toBe("string");
  });

  it("404s for an action belonging to a different user", async () => {
    const owner = await createTestUser({
      agentModeEnabled: true,
      agentAutonomyEnabled: true,
      agentConsentedAt: new Date(),
    });
    const stranger = await createTestUser();
    const target = await createTestUser();
    createdUserIds.push(owner.id, stranger.id, target.id);

    authState.clerkId = owner.clerkId;
    const queueRes = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });
    expect(queueRes.status).toBe(201);
    const actionId = queueRes.body.id as number;

    authState.clerkId = stranger.clerkId;
    const undoRes = await request(app)
      .post(`/api/ai/soul-twin/agent/executed/${actionId}/undo`)
      .send();
    expect(undoRes.status).toBe(404);

    // And the follow row is still there — stranger couldn't reach it.
    const follow = await db.query.followsTable.findFirst({
      where: and(
        eq(followsTable.followerId, owner.id),
        eq(followsTable.followingId, target.id),
      ),
    });
    expect(follow).toBeDefined();
  });
});
