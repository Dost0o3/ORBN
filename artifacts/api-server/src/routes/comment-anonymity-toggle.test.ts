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
import postsRouter from "./posts";
import notificationsRouter from "./notifications";
import {
  db,
  postsTable,
  commentsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

const app = makeApp(usersRouter, postsRouter, notificationsRouter);
const createdUserIds: string[] = [];
const createdPostIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await db.delete(notificationsTable).where(inArray(notificationsTable.postId, createdPostIds)).catch(() => {});
    await db.delete(commentsTable).where(inArray(commentsTable.postId, createdPostIds)).catch(() => {});
    await db.delete(postsTable).where(inArray(postsTable.id, createdPostIds)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

async function setupPostAndComment(initialAnon: boolean) {
  const owner = await createTestUser();
  const commenter = await createTestUser();
  createdUserIds.push(owner.id, commenter.id);

  authState.clerkId = owner.clerkId;
  const created = await request(app).post("/api/posts").send({ content: "owner post" });
  expect(created.status).toBe(201);
  const postId: number = created.body.id;
  createdPostIds.push(postId);

  authState.clerkId = commenter.clerkId;
  const commentRes = await request(app)
    .post(`/api/posts/${postId}/comments`)
    .send({ content: "hello", isAnonymous: initialAnon });
  expect(commentRes.status).toBe(201);
  return { owner, commenter, postId, commentId: commentRes.body.id as number };
}

describe("PATCH /api/posts/:postId/comments/:commentId — anonymity toggle", () => {
  it("lets the commenter re-anonymize their previously attributed comment and rewrites the post-owner notification", async () => {
    const { owner, commenter, postId, commentId } = await setupPostAndComment(false);

    // Sanity: notification was created with actorId = commenter.id.
    const before = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(before?.actorId).toBe(commenter.id);

    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: true });
    expect(patched.status).toBe(200);
    expect(patched.body.isAnonymous).toBe(true);

    const row = await db.query.commentsTable.findFirst({ where: eq(commentsTable.id, commentId) });
    expect(row?.isAnonymous).toBe(true);

    const after = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(after?.actorId).toBeNull();
    expect(after?.message).toBe("A commenter on your post made their comment anonymous");

    // The post owner viewing comments must now see author: null.
    authState.clerkId = owner.clerkId;
    const list = await request(app).get(`/api/posts/${postId}/comments`);
    const seen = list.body.comments.find((c: any) => c.id === commentId);
    expect(seen?.author).toBeNull();
    expect(JSON.stringify(seen)).not.toContain(commenter.id);
  });

  it("lets the commenter reveal a previously anonymous comment and patches the notification's actorId", async () => {
    const { owner, commenter, postId, commentId } = await setupPostAndComment(true);

    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: false });
    expect(patched.status).toBe(200);
    expect(patched.body.isAnonymous).toBe(false);

    const after = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(after?.actorId).toBe(commenter.id);
    expect(after?.message).toBe("An anonymous commenter on your post revealed their identity");

    authState.clerkId = owner.clerkId;
    const list = await request(app).get(`/api/posts/${postId}/comments`);
    const seen = list.body.comments.find((c: any) => c.id === commentId);
    expect(seen?.author?.id).toBe(commenter.id);
  });

  it("rejects toggling someone else's comment with 403 and leaves the row untouched", async () => {
    const { commenter, postId, commentId } = await setupPostAndComment(false);
    const intruder = await createTestUser();
    createdUserIds.push(intruder.id);

    authState.clerkId = intruder.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: true });
    expect(patched.status).toBe(403);

    const row = await db.query.commentsTable.findFirst({ where: eq(commentsTable.id, commentId) });
    expect(row?.isAnonymous).toBe(false);
    expect(row?.authorId).toBe(commenter.id);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const { postId, commentId } = await setupPostAndComment(false);
    authState.clerkId = null;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: true });
    expect(patched.status).toBe(401);
  });

  it("rewrites a legacy notification that pre-dates metadata.commentId stamping", async () => {
    // Simulate the legacy-data shape: an attributed comment whose notification
    // was written before we started stamping metadata.commentId. Re-anonymizing
    // must still flip notifications.actorId to null so the post owner can't
    // de-anonymize via the notifications feed.
    const { owner, commenter, postId, commentId } = await setupPostAndComment(false);
    await db
      .update(notificationsTable)
      .set({ metadata: null })
      .where(and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ));

    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: true });
    expect(patched.status).toBe(200);

    const after = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(after?.actorId).toBeNull();
    expect(after?.message).toBe("A commenter on your post made their comment anonymous");
    // Backfill: the legacy row should now carry the commentId for next time.
    expect((after?.metadata as { commentId?: number } | null)?.commentId).toBe(commentId);
  });

  it("bumps the post owner's notification (read=false, createdAt advanced, metadata.flipped='revealed') when an anon comment is revealed — so the reveal isn't silent", async () => {
    const { owner, commenter, postId, commentId } = await setupPostAndComment(true);

    // Pre-state: post owner reads everything, then time passes.
    authState.clerkId = owner.clerkId;
    const readAll = await request(app).post("/api/notifications/read-all");
    expect(readAll.status).toBe(200);
    const before = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(before?.read).toBe(true);
    const beforeCreatedAt = new Date(before!.createdAt as unknown as string | Date).getTime();

    const unreadBefore = await request(app).get("/api/notifications/unread-count");
    expect(unreadBefore.body.count).toBe(0);

    // Sleep ~10ms so the bumped createdAt is strictly greater than the original.
    await new Promise((r) => setTimeout(r, 15));

    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: false });
    expect(patched.status).toBe(200);

    const after = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(after?.read).toBe(false);
    expect(after?.actorId).toBe(commenter.id);
    expect(after?.message).toBe("An anonymous commenter on your post revealed their identity");
    const afterCreatedAt = new Date(after!.createdAt as unknown as string | Date).getTime();
    expect(afterCreatedAt).toBeGreaterThan(beforeCreatedAt);
    const meta = after?.metadata as { commentId?: number; flipped?: string } | null;
    expect(meta?.commentId).toBe(commentId);
    expect(meta?.flipped).toBe("revealed");

    // Owner-facing surface: unread count went back up, and the bumped row
    // appears in the feed enriched with the now-known commenter.
    authState.clerkId = owner.clerkId;
    const unreadAfter = await request(app).get("/api/notifications/unread-count");
    expect(unreadAfter.body.count).toBeGreaterThanOrEqual(1);
    const feed = await request(app).get("/api/notifications");
    expect(feed.status).toBe(200);
    const enriched = feed.body.notifications.find(
      (n: { type: string; postId: number | null }) =>
        n.type === "comment" && n.postId === postId,
    );
    expect(enriched?.read).toBe(false);
    expect(enriched?.actorId).toBe(commenter.id);
    expect(enriched?.actorName).toBe(commenter.displayName);
    expect(enriched?.message).toBe("An anonymous commenter on your post revealed their identity");
  });

  it("bumps the post owner's notification (read=false, createdAt advanced, metadata.flipped='hidden') when an attributed comment is re-anonymized", async () => {
    const { owner, commenter, postId, commentId } = await setupPostAndComment(false);

    authState.clerkId = owner.clerkId;
    await request(app).post("/api/notifications/read-all");
    const before = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(before?.read).toBe(true);
    const beforeCreatedAt = new Date(before!.createdAt as unknown as string | Date).getTime();
    await new Promise((r) => setTimeout(r, 15));

    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: true });
    expect(patched.status).toBe(200);

    const after = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(after?.read).toBe(false);
    expect(after?.actorId).toBeNull();
    expect(after?.message).toBe("A commenter on your post made their comment anonymous");
    const afterCreatedAt = new Date(after!.createdAt as unknown as string | Date).getTime();
    expect(afterCreatedAt).toBeGreaterThan(beforeCreatedAt);
    const meta = after?.metadata as { commentId?: number; flipped?: string } | null;
    expect(meta?.flipped).toBe("hidden");
  });

  it("a no-op flip (commenter PATCHes with the SAME isAnonymous value) does NOT bump the post owner's notification", async () => {
    // No-op should not generate a fresh signal — otherwise commenters could
    // spam the post owner's unread count by repeatedly PATCHing the same
    // value.
    const { owner, commenter, postId, commentId } = await setupPostAndComment(false);

    authState.clerkId = owner.clerkId;
    await request(app).post("/api/notifications/read-all");
    const before = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(before?.read).toBe(true);
    const beforeCreatedAt = new Date(before!.createdAt as unknown as string | Date).getTime();
    await new Promise((r) => setTimeout(r, 15));

    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/${commentId}`)
      .send({ isAnonymous: false });
    expect(patched.status).toBe(200);

    const after = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, owner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(after?.read).toBe(true);
    const afterCreatedAt = new Date(after!.createdAt as unknown as string | Date).getTime();
    expect(afterCreatedAt).toBe(beforeCreatedAt);
    expect(after?.message).toBe("Someone commented on your post");
  });

  it("returns 404 for a comment that doesn't belong to the given post", async () => {
    const { commenter, postId } = await setupPostAndComment(false);
    authState.clerkId = commenter.clerkId;
    const patched = await request(app)
      .patch(`/api/posts/${postId}/comments/99999999`)
      .send({ isAnonymous: true });
    expect(patched.status).toBe(404);
  });
});
