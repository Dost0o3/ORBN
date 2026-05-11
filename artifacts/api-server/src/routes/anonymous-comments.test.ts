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
import {
  db,
  postsTable,
  commentsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

interface CommentResponse {
  id: number;
  content: string;
  isAnonymous: boolean;
  author: { id: string; displayName?: string | null } | null;
}
interface ListCommentsResponse {
  comments: CommentResponse[];
  total: number;
}

const app = makeApp(usersRouter, postsRouter);
const createdUserIds: string[] = [];
const createdPostIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await db
      .delete(notificationsTable)
      .where(inArray(notificationsTable.postId, createdPostIds))
      .catch(() => {});
    await db
      .delete(commentsTable)
      .where(inArray(commentsTable.postId, createdPostIds))
      .catch(() => {});
    await db
      .delete(postsTable)
      .where(inArray(postsTable.id, createdPostIds))
      .catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("GET /api/posts/:postId/comments — anonymous-comment author masking", () => {
  it("hides the commenter's identity from the post owner and other viewers, but reveals it to the commenter themselves", async () => {
    const postOwner = await createTestUser();
    const commenter = await createTestUser();
    const otherViewer = await createTestUser();
    createdUserIds.push(postOwner.id, commenter.id, otherViewer.id);

    // Post owner creates a public post.
    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner's post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    // Commenter leaves an anonymous comment.
    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "anonymous comment", isAnonymous: true });
    expect(commentRes.status).toBe(201);
    const commentId: number = commentRes.body.id;

    // Sanity: the row in DB is flagged anonymous, and authorId is intact.
    const row = await db.query.commentsTable.findFirst({
      where: eq(commentsTable.id, commentId),
    });
    expect(row?.isAnonymous).toBe(true);
    expect(row?.authorId).toBe(commenter.id);

    // Post owner fetches comments — must see author: null and no leaked id.
    authState.clerkId = postOwner.clerkId;
    const asOwner = await request(app).get(`/api/posts/${postId}/comments`);
    expect(asOwner.status).toBe(200);
    const ownerBody: ListCommentsResponse = asOwner.body;
    const ownerView = ownerBody.comments.find((c) => c.id === commentId);
    if (!ownerView) throw new Error("comment missing from owner view");
    expect(ownerView.isAnonymous).toBe(true);
    expect(ownerView.author).toBeNull();
    // Defense in depth: the serialized payload for this comment must not
    // contain the commenter's id anywhere (no leaked authorId spread).
    expect(JSON.stringify(ownerView)).not.toContain(commenter.id);

    // A different signed-in viewer also gets a masked comment.
    authState.clerkId = otherViewer.clerkId;
    const asOther = await request(app).get(`/api/posts/${postId}/comments`);
    expect(asOther.status).toBe(200);
    const otherBody: ListCommentsResponse = asOther.body;
    const otherView = otherBody.comments.find((c) => c.id === commentId);
    if (!otherView) throw new Error("comment missing from other-viewer view");
    expect(otherView.isAnonymous).toBe(true);
    expect(otherView.author).toBeNull();
    expect(JSON.stringify(otherView)).not.toContain(commenter.id);

    // The commenter sees their own real identity on their own comment.
    authState.clerkId = commenter.clerkId;
    const asCommenter = await request(app).get(`/api/posts/${postId}/comments`);
    expect(asCommenter.status).toBe(200);
    const commenterBody: ListCommentsResponse = asCommenter.body;
    const selfView = commenterBody.comments.find((c) => c.id === commentId);
    if (!selfView) throw new Error("comment missing from commenter's own view");
    expect(selfView.isAnonymous).toBe(true);
    expect(selfView.author?.id).toBe(commenter.id);
  });

  it("never masks the author of a non-anonymous comment", async () => {
    const postOwner = await createTestUser();
    const commenter = await createTestUser();
    createdUserIds.push(postOwner.id, commenter.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner's other post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "public comment", isAnonymous: false });
    expect(commentRes.status).toBe(201);
    const commentId: number = commentRes.body.id;

    authState.clerkId = postOwner.clerkId;
    const asOwner = await request(app).get(`/api/posts/${postId}/comments`);
    expect(asOwner.status).toBe(200);
    const body: ListCommentsResponse = asOwner.body;
    const found = body.comments.find((c) => c.id === commentId);
    if (!found) throw new Error("public comment missing from owner view");
    expect(found.isAnonymous).toBe(false);
    expect(found.author?.id).toBe(commenter.id);
  });
});

describe("createCommentForPost — anonymous comment notification masking", () => {
  it("inserts the post owner's notification with actorId = null so the notifications feed cannot enrich it into the commenter's name/avatar", async () => {
    const postOwner = await createTestUser();
    const commenter = await createTestUser();
    createdUserIds.push(postOwner.id, commenter.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner's post for notif test" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "shadow comment", isAnonymous: true });
    expect(commentRes.status).toBe(201);

    // The comment-notification insert is awaited inside the route, so by the
    // time the response returns the notification row exists.
    const notif = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, postOwner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    if (!notif) throw new Error("expected comment notification for post owner");
    expect(notif.actorId).toBeNull();
    // Even the message text must not be the personalised "X commented" form
    // — it has to be the generic anonymous form.
    expect(notif.message).toBe("Someone commented anonymously on your post");
  });

  it("stores the commenter's actorId on a non-anonymous comment notification (control case)", async () => {
    const postOwner = await createTestUser();
    const commenter = await createTestUser();
    createdUserIds.push(postOwner.id, commenter.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner's post for control notif" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "loud comment", isAnonymous: false });
    expect(commentRes.status).toBe(201);

    const notif = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, postOwner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    if (!notif) throw new Error("expected comment notification for post owner");
    expect(notif.actorId).toBe(commenter.id);
  });
});
