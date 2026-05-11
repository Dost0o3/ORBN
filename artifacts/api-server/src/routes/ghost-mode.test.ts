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
import { db, postsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
  reloadUser,
} from "../test/test-helpers";

// Minimal response shapes used by these tests. Kept narrow on purpose:
// only the fields the test bodies assert against, so a future change to
// the route's shape that doesn't affect these fields won't break tests,
// while a change that drops/renames them will.
interface PostResponse {
  id: number;
  isAnonymous: boolean;
  author: { id: string } | null;
}
interface ListPostsResponse {
  posts: PostResponse[];
}

const app = makeApp(usersRouter, postsRouter);
const createdUserIds: string[] = [];
const createdPostIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await db.delete(postsTable).where(inArray(postsTable.id, createdPostIds)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("PUT /api/users/me/ghost-mode", () => {
  it("flips ghostMode on the user record and echoes the new state", async () => {
    const user = await createTestUser({ ghostMode: false });
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const on = await request(app).put("/api/users/me/ghost-mode").send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ ghostMode: true });
    expect((await reloadUser(user.id))?.ghostMode).toBe(true);

    const off = await request(app).put("/api/users/me/ghost-mode").send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ ghostMode: false });
    expect((await reloadUser(user.id))?.ghostMode).toBe(false);
  });

  it("rejects non-boolean enabled with 400 and does not change state", async () => {
    const user = await createTestUser({ ghostMode: true });
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).put("/api/users/me/ghost-mode").send({ enabled: "yes" });
    expect(res.status).toBe(400);
    expect((await reloadUser(user.id))?.ghostMode).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    authState.clerkId = null;
    const res = await request(app).put("/api/users/me/ghost-mode").send({ enabled: true });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/posts — Ghost Mode anonymous stamping", () => {
  it("stamps is_anonymous=true on a new post when the author has ghostMode on", async () => {
    const author = await createTestUser({ ghostMode: true });
    createdUserIds.push(author.id);
    authState.clerkId = author.clerkId;

    const res = await request(app).post("/api/posts").send({ content: "hello from the void" });
    expect(res.status).toBe(201);
    createdPostIds.push(res.body.id);

    const row = await db.query.postsTable.findFirst({ where: eq(postsTable.id, res.body.id) });
    expect(row?.isAnonymous).toBe(true);
    // Even though the response goes back to the author (who can see their own
    // identity on their own ghost posts), the stored row must be flagged.
    expect(res.body.isAnonymous).toBe(true);
  });

  it("does NOT stamp is_anonymous when ghostMode is off and no override is sent", async () => {
    const author = await createTestUser({ ghostMode: false });
    createdUserIds.push(author.id);
    authState.clerkId = author.clerkId;

    const res = await request(app).post("/api/posts").send({ content: "loud and proud" });
    expect(res.status).toBe(201);
    createdPostIds.push(res.body.id);

    const row = await db.query.postsTable.findFirst({ where: eq(postsTable.id, res.body.id) });
    expect(row?.isAnonymous).toBe(false);
    expect(res.body.isAnonymous).toBe(false);
  });

  it("respects an explicit per-post isAnonymous override even when ghostMode is off", async () => {
    const author = await createTestUser({ ghostMode: false });
    createdUserIds.push(author.id);
    authState.clerkId = author.clerkId;

    const res = await request(app)
      .post("/api/posts")
      .send({ content: "secret one-off", isAnonymous: true });
    expect(res.status).toBe(201);
    createdPostIds.push(res.body.id);

    const row = await db.query.postsTable.findFirst({ where: eq(postsTable.id, res.body.id) });
    expect(row?.isAnonymous).toBe(true);
  });
});

describe("GET /api/posts — viewer-aware author redaction", () => {
  it("hides the author of an anonymous post from a non-author viewer but shows it to the author", async () => {
    const author = await createTestUser({
      ghostMode: true,
      // Pre-set cached score so the route's getBatchPowerScores doesn't trigger
      // a recompute that would race with our assertions.
      powerScoreCached: 100,
      powerRankCached: "RECRUIT",
      powerScoreCachedAt: new Date(),
    });
    const viewer = await createTestUser({
      ghostMode: false,
      powerScoreCached: 100,
      powerRankCached: "RECRUIT",
      powerScoreCachedAt: new Date(),
    });
    createdUserIds.push(author.id, viewer.id);

    // Author posts a ghost-mode post via the route so the same code path runs.
    authState.clerkId = author.clerkId;
    const created = await request(app).post("/api/posts").send({ content: "ghosted post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);

    // Non-author viewer: feed must NOT leak author identity for the ghost post.
    authState.clerkId = viewer.clerkId;
    const asViewer = await request(app).get("/api/posts?strict=true&limit=100");
    expect(asViewer.status).toBe(200);
    const viewerBody: ListPostsResponse = asViewer.body;
    const ghostFromViewer = viewerBody.posts.find((p) => p.id === created.body.id);
    if (!ghostFromViewer) throw new Error("ghost post not found in viewer feed");
    expect(ghostFromViewer.isAnonymous).toBe(true);
    expect(ghostFromViewer.author).toBeNull();
    // Defense in depth: serialized response must not contain the author's id
    // anywhere on the post object (no spread leak of authorId/originalPostId).
    const serialized = JSON.stringify(ghostFromViewer);
    expect(serialized).not.toContain(author.id);

    // Author viewer: same post, but they see themselves as the author so they
    // can recognise/manage their ghost posts.
    authState.clerkId = author.clerkId;
    const asAuthor = await request(app).get("/api/posts?strict=true&limit=100");
    expect(asAuthor.status).toBe(200);
    const authorBody: ListPostsResponse = asAuthor.body;
    const ghostFromAuthor = authorBody.posts.find((p) => p.id === created.body.id);
    if (!ghostFromAuthor) throw new Error("ghost post not found in author feed");
    expect(ghostFromAuthor.isAnonymous).toBe(true);
    expect(ghostFromAuthor.author?.id).toBe(author.id);
  });

  it("never redacts non-anonymous posts", async () => {
    const author = await createTestUser({
      ghostMode: false,
      powerScoreCached: 50,
      powerRankCached: "RECRUIT",
      powerScoreCachedAt: new Date(),
    });
    const viewer = await createTestUser({
      powerScoreCached: 50,
      powerRankCached: "RECRUIT",
      powerScoreCachedAt: new Date(),
    });
    createdUserIds.push(author.id, viewer.id);

    authState.clerkId = author.clerkId;
    const created = await request(app).post("/api/posts").send({ content: "public post" });
    expect(created.status).toBe(201);
    createdPostIds.push(created.body.id);

    authState.clerkId = viewer.clerkId;
    const asViewer = await request(app).get("/api/posts?strict=true&limit=100");
    const body: ListPostsResponse = asViewer.body;
    const found = body.posts.find((p) => p.id === created.body.id);
    expect(found?.isAnonymous).toBe(false);
    expect(found?.author?.id).toBe(author.id);
  });
});

describe("GET /api/posts/:postId — viewer-aware author redaction", () => {
  it("shows the author themselves their own ghost post with their real identity", async () => {
    const author = await createTestUser({ ghostMode: true });
    createdUserIds.push(author.id);

    authState.clerkId = author.clerkId;
    const ghost = await request(app).post("/api/posts").send({ content: "single-ghost-self" });
    expect(ghost.status).toBe(201);
    createdPostIds.push(ghost.body.id);

    const asAuthor = await request(app).get(`/api/posts/${ghost.body.id}`);
    expect(asAuthor.status).toBe(200);
    const body: PostResponse = asAuthor.body;
    expect(body.isAnonymous).toBe(true);
    expect(body.author?.id).toBe(author.id);
  });

  it("redacts the author for a different signed-in viewer and never leaks the real author id", async () => {
    const author = await createTestUser({ ghostMode: true });
    const viewer = await createTestUser({ ghostMode: false });
    createdUserIds.push(author.id, viewer.id);

    authState.clerkId = author.clerkId;
    const ghost = await request(app).post("/api/posts").send({ content: "single-ghost-other" });
    expect(ghost.status).toBe(201);
    createdPostIds.push(ghost.body.id);

    authState.clerkId = viewer.clerkId;
    const asViewer = await request(app).get(`/api/posts/${ghost.body.id}`);
    expect(asViewer.status).toBe(200);
    const body: PostResponse = asViewer.body;
    expect(body.isAnonymous).toBe(true);
    expect(body.author).toBeNull();
    // Defense in depth: the entire serialized response must not mention the
    // real author's id anywhere (no leaked authorId / originalPostId spread).
    expect(JSON.stringify(body)).not.toContain(author.id);
  });

  it("redacts the author for an unauthenticated viewer the same way", async () => {
    const author = await createTestUser({ ghostMode: true });
    createdUserIds.push(author.id);

    authState.clerkId = author.clerkId;
    const ghost = await request(app).post("/api/posts").send({ content: "single-ghost-anon" });
    expect(ghost.status).toBe(201);
    createdPostIds.push(ghost.body.id);

    authState.clerkId = null;
    const asAnon = await request(app).get(`/api/posts/${ghost.body.id}`);
    expect(asAnon.status).toBe(200);
    const body: PostResponse = asAnon.body;
    expect(body.isAnonymous).toBe(true);
    expect(body.author).toBeNull();
    expect(JSON.stringify(body)).not.toContain(author.id);
  });

  it("never redacts a non-anonymous post on the by-id endpoint", async () => {
    const author = await createTestUser({ ghostMode: false });
    const viewer = await createTestUser();
    createdUserIds.push(author.id, viewer.id);

    authState.clerkId = author.clerkId;
    const pub = await request(app).post("/api/posts").send({ content: "single-public" });
    expect(pub.status).toBe(201);
    createdPostIds.push(pub.body.id);

    authState.clerkId = viewer.clerkId;
    const asViewer = await request(app).get(`/api/posts/${pub.body.id}`);
    expect(asViewer.status).toBe(200);
    const body: PostResponse = asViewer.body;
    expect(body.isAnonymous).toBe(false);
    expect(body.author?.id).toBe(author.id);
  });
});

describe("GET /api/users/:userId/posts — viewer-aware author redaction", () => {
  it("filters anonymous posts out for non-author viewers", async () => {
    const author = await createTestUser({ ghostMode: true });
    const viewer = await createTestUser();
    createdUserIds.push(author.id, viewer.id);

    // Mix one ghost post and one public post for the same author.
    authState.clerkId = author.clerkId;
    const ghost = await request(app).post("/api/posts").send({ content: "g1" });
    expect(ghost.status).toBe(201);
    createdPostIds.push(ghost.body.id);

    // Flip ghost mode off, post a public one.
    await request(app).put("/api/users/me/ghost-mode").send({ enabled: false });
    const pub = await request(app).post("/api/posts").send({ content: "p1" });
    expect(pub.status).toBe(201);
    createdPostIds.push(pub.body.id);

    // Non-author viewer must only see the public post; the ghost post must not
    // appear at all on the by-user listing (URL itself binds posts to a user,
    // so even redacting the author would de-anonymise them).
    authState.clerkId = viewer.clerkId;
    const asViewer = await request(app).get(`/api/users/${author.id}/posts?limit=50`);
    expect(asViewer.status).toBe(200);
    const viewerBody: ListPostsResponse = asViewer.body;
    const ids = viewerBody.posts.map((p) => p.id);
    expect(ids).toContain(pub.body.id);
    expect(ids).not.toContain(ghost.body.id);
    // None of the returned posts should be flagged anonymous.
    expect(viewerBody.posts.every((p) => p.isAnonymous === false)).toBe(true);
  });

  it("shows the author themselves their own ghost posts with their real identity", async () => {
    const author = await createTestUser({ ghostMode: true });
    createdUserIds.push(author.id);

    authState.clerkId = author.clerkId;
    const ghost = await request(app).post("/api/posts").send({ content: "g-self" });
    expect(ghost.status).toBe(201);
    createdPostIds.push(ghost.body.id);

    const asAuthor = await request(app).get(`/api/users/${author.id}/posts?limit=50`);
    expect(asAuthor.status).toBe(200);
    const authorBody: ListPostsResponse = asAuthor.body;
    const found = authorBody.posts.find((p) => p.id === ghost.body.id);
    if (!found) throw new Error("ghost post missing from author's by-user listing");
    expect(found.isAnonymous).toBe(true);
    expect(found.author?.id).toBe(author.id);
  });

  it("hides anonymous posts from anonymous (unauthenticated) viewers", async () => {
    const author = await createTestUser({ ghostMode: true });
    createdUserIds.push(author.id);

    authState.clerkId = author.clerkId;
    const ghost = await request(app).post("/api/posts").send({ content: "g-anon" });
    expect(ghost.status).toBe(201);
    createdPostIds.push(ghost.body.id);

    authState.clerkId = null;
    const asAnon = await request(app).get(`/api/users/${author.id}/posts?limit=50`);
    expect(asAnon.status).toBe(200);
    const anonBody: ListPostsResponse = asAnon.body;
    const ids = anonBody.posts.map((p) => p.id);
    expect(ids).not.toContain(ghost.body.id);
  });
});
