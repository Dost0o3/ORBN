import { describe, it, expect, afterAll, vi } from "vitest";
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
import { inArray, sql } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

const app = makeApp(usersRouter, postsRouter);
const createdUserIds: string[] = [];
const createdPostIds: number[] = [];

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await db.delete(postsTable).where(inArray(postsTable.id, createdPostIds)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

async function totalPostCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(postsTable);
  return Number(row?.count ?? 0);
}

describe("GET /api/posts — strict pagination hasMore contract", () => {
  it("returns hasMore=true only when more posts exist beyond offset+posts.length", async () => {
    // Pre-populate enough posts so the pagination math has room to breathe.
    const author = await createTestUser({
      // Pre-set cached score so the route's getBatchPowerScores doesn't
      // trigger a recompute that would race with our assertions.
      powerScoreCached: 100,
      powerRankCached: "RECRUIT",
      powerScoreCachedAt: new Date(),
    });
    createdUserIds.push(author.id);

    const NEW_POSTS = 5;
    for (let i = 0; i < NEW_POSTS; i++) {
      const [p] = await db.insert(postsTable).values({
        authorId: author.id,
        content: `pagination test post ${i}`,
        hashtags: [],
        isRepost: 0,
        isAnonymous: false,
      }).returning();
      createdPostIds.push(p.id);
    }

    authState.clerkId = author.clerkId;

    const total = await totalPostCount();
    expect(total).toBeGreaterThanOrEqual(NEW_POSTS);

    // Case 1: limit < total → hasMore must be true.
    const small = await request(app).get("/api/posts?strict=true&limit=2&offset=0");
    expect(small.status).toBe(200);
    expect(small.body.posts.length).toBe(2);
    expect(small.body.total).toBe(total);
    expect(small.body.hasMore).toBe(true);

    // Case 2: offset + limit >= total → hasMore must be false (no more rows beyond).
    // Use offset=total-1, limit=10 → returns exactly 1 post, offset+length=total.
    const lastPage = await request(app).get(`/api/posts?strict=true&limit=10&offset=${total - 1}`);
    expect(lastPage.status).toBe(200);
    expect(lastPage.body.posts.length).toBe(1);
    expect(lastPage.body.hasMore).toBe(false);

    // Case 3: offset == total → returns 0 posts, hasMore=false.
    const beyond = await request(app).get(`/api/posts?strict=true&limit=10&offset=${total}`);
    expect(beyond.status).toBe(200);
    expect(beyond.body.posts.length).toBe(0);
    expect(beyond.body.hasMore).toBe(false);
  });
});
