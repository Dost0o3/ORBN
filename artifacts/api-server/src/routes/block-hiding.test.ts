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
  directBlocksTable,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

const app = makeApp(usersRouter, postsRouter);
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
  if (createdUserIds.length > 0) {
    await db
      .delete(directBlocksTable)
      .where(or(inArray(directBlocksTable.blockerId, createdUserIds), inArray(directBlocksTable.blockedId, createdUserIds)))
      .catch(() => {});
    await deleteTestUsers(createdUserIds);
  }
});

interface PostShape { id: number; author: { id: string } | null }
interface PostsResponse { posts: PostShape[]; total: number }
interface UsersResponse { users: Array<{ id: string }> }

describe("mutual block hiding across feed, comments, search, suggestions, and profile", () => {
  // Task #66: blocking only used to affect DMs; this suite locks in the
  // contract that a block ALSO hides the blocked user's content from the
  // viewer's feed, comment threads, search results, suggestions, and the
  // direct profile/post fetch endpoints — in BOTH directions, so the
  // blocked user can't peek either.

  it("hides a blocked author's posts and comments from feed, by-user list, single fetch, search, suggestions, and profile (both directions)", async () => {
    const viewer = await createTestUser({ displayName: "Viewer" });
    const offender = await createTestUser({ displayName: "Offender" });
    const bystander = await createTestUser({ displayName: "Bystander" });
    createdUserIds.push(viewer.id, offender.id, bystander.id);

    // One post + one comment by the offender, plus a sibling post by the
    // bystander so we can prove only the offender's content disappears.
    const [offenderPost] = await db.insert(postsTable).values({ authorId: offender.id, content: "from offender", hashtags: [] }).returning();
    const [bystanderPost] = await db.insert(postsTable).values({ authorId: bystander.id, content: "from bystander", hashtags: [] }).returning();
    createdPostIds.push(offenderPost.id, bystanderPost.id);
    await db.insert(commentsTable).values({ postId: bystanderPost.id, authorId: offender.id, content: "offender comment on bystander post" });

    // --- Baseline: BEFORE any block, viewer can see both posts, the
    // offender's comment, the offender in search/suggestions, the
    // offender's profile, and the offender's by-user post listing. ---
    authState.clerkId = viewer.clerkId;

    const feedBefore = await request(app).get("/api/posts").expect(200);
    const feedBeforeBody = feedBefore.body as PostsResponse;
    expect(feedBeforeBody.posts.some((p) => p.author?.id === offender.id)).toBe(true);

    const commentsBefore = await request(app).get(`/api/posts/${bystanderPost.id}/comments`).expect(200);
    expect((commentsBefore.body as { comments: Array<{ author: { id: string } | null }> }).comments.some((c) => c.author?.id === offender.id)).toBe(true);

    const singleBefore = await request(app).get(`/api/posts/${offenderPost.id}`);
    expect(singleBefore.status).toBe(200);

    const profileBefore = await request(app).get(`/api/users/${offender.id}`);
    expect(profileBefore.status).toBe(200);

    const userPostsBefore = await request(app).get(`/api/users/${offender.id}/posts`).expect(200);
    expect((userPostsBefore.body as PostsResponse).posts.length).toBeGreaterThan(0);

    const searchBefore = await request(app).get(`/api/users/search?q=${encodeURIComponent("Offender")}`).expect(200);
    expect((searchBefore.body as UsersResponse).users.some((u) => u.id === offender.id)).toBe(true);

    // Suggestions are random + capped — ask for a wide window so we have
    // a fair chance of seeing the offender. We just need to confirm they
    // *can* appear before the block; after the block they MUST NOT.
    await request(app).get(`/api/feed/suggested-users?limit=50`).expect(200);

    // --- Now the viewer blocks the offender. ---
    await db.insert(directBlocksTable).values({ blockerId: viewer.id, blockedId: offender.id });

    // Feed: offender's post is gone, bystander's remains.
    const feedAfter = await request(app).get("/api/posts").expect(200);
    const feedAfterBody = feedAfter.body as PostsResponse;
    expect(feedAfterBody.posts.some((p) => p.author?.id === offender.id)).toBe(false);
    expect(feedAfterBody.posts.some((p) => p.author?.id === bystander.id)).toBe(true);

    // Comments under the bystander's post: offender's comment is gone.
    const commentsAfter = await request(app).get(`/api/posts/${bystanderPost.id}/comments`).expect(200);
    expect((commentsAfter.body as { comments: Array<{ author: { id: string } | null }> }).comments.some((c) => c.author?.id === offender.id)).toBe(false);

    // Single post fetch: 404 instead of 200 (don't leak existence).
    const singleAfter = await request(app).get(`/api/posts/${offenderPost.id}`);
    expect(singleAfter.status).toBe(404);

    // Profile-by-id and by-user posts: 404 / empty.
    const profileAfter = await request(app).get(`/api/users/${offender.id}`);
    expect(profileAfter.status).toBe(404);
    const userPostsAfter = await request(app).get(`/api/users/${offender.id}/posts`).expect(200);
    expect((userPostsAfter.body as PostsResponse).posts).toEqual([]);

    // Search: offender excluded.
    const searchAfter = await request(app).get(`/api/users/search?q=${encodeURIComponent("Offender")}`).expect(200);
    expect((searchAfter.body as UsersResponse).users.some((u) => u.id === offender.id)).toBe(false);

    // Suggestions: even with limit=50 the offender must never appear.
    const suggestionsAfter = await request(app).get(`/api/feed/suggested-users?limit=50`).expect(200);
    expect((suggestionsAfter.body as UsersResponse).users.some((u) => u.id === offender.id)).toBe(false);

    // --- Reverse direction: clear the viewer→offender block, and have
    //     the OFFENDER block the viewer instead. The viewer must still
    //     stop seeing the offender's content. ---
    await db.delete(directBlocksTable).where(and(eq(directBlocksTable.blockerId, viewer.id), eq(directBlocksTable.blockedId, offender.id)));
    await db.insert(directBlocksTable).values({ blockerId: offender.id, blockedId: viewer.id });

    const feedReverse = await request(app).get("/api/posts").expect(200);
    expect((feedReverse.body as PostsResponse).posts.some((p) => p.author?.id === offender.id)).toBe(false);

    const profileReverse = await request(app).get(`/api/users/${offender.id}`);
    expect(profileReverse.status).toBe(404);
  });
});
