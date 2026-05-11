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

/**
 * Side-channel anonymity audit for Task #59.
 *
 * Task #42 already locked down the two front-door surfaces:
 *   1. GET /api/posts/:postId/comments — author is masked
 *   2. createCommentForPost — comment notification stores actorId = null
 *
 * This file covers the *indirect* surfaces that could re-leak the same
 * commenter id we already masked above:
 *
 *   A. GET /api/notifications — the enrichment path joins actorId →
 *      actorName/actorAvatar. If actorId ever ends up non-null on an
 *      anonymous comment notification (legacy bug, partial migration,
 *      future regression), the post owner's notifications feed would
 *      silently de-anonymize the commenter via name + avatar.
 *
 *   B. GET /api/posts/:postId/comments full-payload check — the existing
 *      anonymous-comments.test.ts already asserts the *single comment* in
 *      isolation hides the id, but a future refactor that adds a
 *      top-level field (e.g. a "viewers who commented" summary, an
 *      author-id index, etc.) could leak the id outside the per-comment
 *      object. We assert the entire serialized response — for both the
 *      post owner and an unrelated viewer — contains zero occurrences of
 *      the commenter's id.
 *
 *   C. POST /api/posts/:postId/comments echo — the create-response goes
 *      back to the commenter themselves (so it must contain their id),
 *      but a separate viewer fetching the same comment immediately after
 *      must see masked author. Re-asserts the masking holds the moment
 *      the comment exists, with no race window.
 *
 * Note: there is no comment-likes table, no comment-replies table, and
 * no GET /api/comments/:id endpoint in the codebase as of this task,
 * so those bullets from the task description are vacuously satisfied —
 * but the tests here pin the current shape so adding any of them in the
 * future will require touching this file.
 */

const app = makeApp(usersRouter, postsRouter, notificationsRouter);
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

interface NotificationRow {
  id: number;
  type: string;
  message: string;
  actorId: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  postId: number | null;
}
interface ListNotificationsResponse {
  notifications: NotificationRow[];
  unreadCount: number;
}

describe("GET /api/notifications — anonymous-comment enrichment leak", () => {
  it("returns actorId/actorName/actorAvatar all null for the post owner's anonymous-comment notification, and the JSON contains no trace of the commenter's id", async () => {
    const postOwner = await createTestUser({ displayName: "Owner Name" });
    const commenter = await createTestUser({ displayName: "Commenter Name" });
    createdUserIds.push(postOwner.id, commenter.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner side-channel post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "anon side-channel comment", isAnonymous: true });
    expect(commentRes.status).toBe(201);

    // Sanity: the underlying notification row really did get actorId=null.
    const dbRow = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, postOwner.id),
        eq(notificationsTable.postId, postId),
        eq(notificationsTable.type, "comment"),
      ),
    });
    expect(dbRow?.actorId).toBeNull();

    // Now hit the enrichment endpoint as the post owner.
    authState.clerkId = postOwner.clerkId;
    const feed = await request(app).get("/api/notifications");
    expect(feed.status).toBe(200);
    const body: ListNotificationsResponse = feed.body;

    const enriched = body.notifications.find(
      (n) => n.type === "comment" && n.postId === postId,
    );
    if (!enriched) throw new Error("expected the anon-comment notification in the feed");

    // The actor lookup must short-circuit on null actorId — so name and
    // avatar must come back null. If a future enrichment path falls back
    // to a different field (e.g. metadata.commentId → comment.authorId),
    // these assertions will catch it.
    expect(enriched.actorId).toBeNull();
    expect(enriched.actorName).toBeNull();
    expect(enriched.actorAvatar).toBeNull();
    expect(enriched.message).toBe("Someone commented anonymously on your post");

    // Defense in depth: the entire serialized notification — and the
    // surrounding feed envelope — must contain zero occurrences of the
    // commenter's user id. Catches accidental leaks via metadata, debug
    // fields, sibling rows, etc.
    expect(JSON.stringify(enriched)).not.toContain(commenter.id);
    expect(JSON.stringify(body)).not.toContain(commenter.id);
  });

  it("control: a non-anonymous comment notification IS enriched with the commenter's actor info (proves the masking is the cause, not a broken enrichment path)", async () => {
    const postOwner = await createTestUser({ displayName: "Owner B" });
    const commenter = await createTestUser({ displayName: "Loud Commenter" });
    createdUserIds.push(postOwner.id, commenter.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner control post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "loud comment", isAnonymous: false });
    expect(commentRes.status).toBe(201);

    authState.clerkId = postOwner.clerkId;
    const feed = await request(app).get("/api/notifications");
    expect(feed.status).toBe(200);
    const body: ListNotificationsResponse = feed.body;
    const enriched = body.notifications.find(
      (n) => n.type === "comment" && n.postId === postId,
    );
    if (!enriched) throw new Error("expected the public-comment notification in the feed");

    expect(enriched.actorId).toBe(commenter.id);
    expect(enriched.actorName).toBe("Loud Commenter");
  });
});

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

describe("GET /api/posts/:postId/comments — full-payload anonymity audit", () => {
  it("the WHOLE serialized response (not just the per-comment object) contains no occurrences of the anonymous commenter's id, for both the post owner and an unrelated viewer", async () => {
    const postOwner = await createTestUser();
    const commenter = await createTestUser();
    const otherViewer = await createTestUser();
    createdUserIds.push(postOwner.id, commenter.id, otherViewer.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner audit post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    // Mix an anonymous comment in alongside a public comment from a
    // different commenter, so the response has multiple sibling rows —
    // a future "comments[].author summary at the envelope level" leak
    // would show up here even if each individual comment object looks
    // clean.
    authState.clerkId = commenter.clerkId;
    const anonRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "anon mixed comment", isAnonymous: true });
    expect(anonRes.status).toBe(201);

    authState.clerkId = otherViewer.clerkId;
    const publicRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "public mixed comment", isAnonymous: false });
    expect(publicRes.status).toBe(201);

    // Post owner pulls the comment list — the anonymous commenter's id
    // must not appear ANYWHERE in the payload.
    authState.clerkId = postOwner.clerkId;
    const asOwner = await request(app).get(`/api/posts/${postId}/comments`);
    expect(asOwner.status).toBe(200);
    const ownerBody: ListCommentsResponse = asOwner.body;
    expect(JSON.stringify(ownerBody)).not.toContain(commenter.id);
    // The public commenter's id is allowed to (and must) appear — that
    // proves the negative assertion above is meaningful and not just
    // because the response is empty / shaped weirdly.
    expect(JSON.stringify(ownerBody)).toContain(otherViewer.id);

    // An unrelated signed-in viewer gets the same masking.
    const unrelatedViewer = await createTestUser();
    createdUserIds.push(unrelatedViewer.id);
    authState.clerkId = unrelatedViewer.clerkId;
    const asUnrelated = await request(app).get(`/api/posts/${postId}/comments`);
    expect(asUnrelated.status).toBe(200);
    const unrelatedBody: ListCommentsResponse = asUnrelated.body;
    expect(JSON.stringify(unrelatedBody)).not.toContain(commenter.id);
  });

  it("an unrelated viewer fetching IMMEDIATELY after the anonymous comment is created sees the masked shape (no read-after-write race window)", async () => {
    const postOwner = await createTestUser();
    const commenter = await createTestUser();
    const otherViewer = await createTestUser();
    createdUserIds.push(postOwner.id, commenter.id, otherViewer.id);

    authState.clerkId = postOwner.clerkId;
    const created = await request(app)
      .post("/api/posts")
      .send({ content: "owner race post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);
    const postId: number = created.body.id;

    authState.clerkId = commenter.clerkId;
    const commentRes = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .send({ content: "race comment", isAnonymous: true });
    expect(commentRes.status).toBe(201);
    const commentId: number = commentRes.body.id;

    // No artificial wait — fetch as a different viewer right away.
    authState.clerkId = otherViewer.clerkId;
    const list = await request(app).get(`/api/posts/${postId}/comments`);
    expect(list.status).toBe(200);
    const body: ListCommentsResponse = list.body;
    const found = body.comments.find((c) => c.id === commentId);
    if (!found) throw new Error("comment missing from other-viewer view");
    expect(found.isAnonymous).toBe(true);
    expect(found.author).toBeNull();
    expect(JSON.stringify(found)).not.toContain(commenter.id);
  });
});
