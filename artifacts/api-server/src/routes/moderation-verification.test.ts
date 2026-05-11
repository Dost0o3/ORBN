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
import moderationRouter from "./moderation";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

const app = makeApp(usersRouter, moderationRouter);
const createdUserIds: string[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

/**
 * The /admin/users/:userId/verification endpoint is the ONLY supported
 * way to grant the silver/blue check-mark badge that renders next to a
 * user's display name across the product. These tests pin three
 * load-bearing properties:
 *
 *   1. Non-admin callers are rejected with 403 (the badge is a trust
 *      signal — letting any user grant it would defeat its purpose).
 *   2. A successful PATCH echoes the updated profile with the new tier,
 *      so the client can update its cache without a follow-up GET.
 *   3. Passing tier:null revokes the badge cleanly (i.e. the column is
 *      flipped back to NULL, not left as the string "null").
 */
describe("PATCH /api/admin/users/:userId/verification", () => {
  it("rejects non-admin callers with 403", async () => {
    const caller = await createTestUser();
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);
    authState.clerkId = caller.clerkId;

    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/verification`)
      .send({ tier: "silver" });

    expect(res.status).toBe(403);
    const reloaded = await db.query.usersTable.findFirst({ where: eq(usersTable.id, target.id) });
    expect(reloaded?.verificationTier).toBeNull();
  });

  it("admin can grant a silver tier and the response carries the updated profile", async () => {
    const admin = await createTestUser();
    const target = await createTestUser();
    createdUserIds.push(admin.id, target.id);
    await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, admin.id));
    authState.clerkId = admin.clerkId;

    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/verification`)
      .send({ tier: "silver" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(target.id);
    expect(res.body.verificationTier).toBe("silver");
    const reloaded = await db.query.usersTable.findFirst({ where: eq(usersTable.id, target.id) });
    expect(reloaded?.verificationTier).toBe("silver");
  });

  it("admin can promote silver→blue and then revoke with tier:null", async () => {
    const admin = await createTestUser();
    const target = await createTestUser();
    createdUserIds.push(admin.id, target.id);
    await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, admin.id));
    authState.clerkId = admin.clerkId;

    const promote = await request(app)
      .patch(`/api/admin/users/${target.id}/verification`)
      .send({ tier: "blue" });
    expect(promote.status).toBe(200);
    expect(promote.body.verificationTier).toBe("blue");

    const revoke = await request(app)
      .patch(`/api/admin/users/${target.id}/verification`)
      .send({ tier: null });
    expect(revoke.status).toBe(200);
    expect(revoke.body.verificationTier).toBeNull();

    const reloaded = await db.query.usersTable.findFirst({ where: eq(usersTable.id, target.id) });
    expect(reloaded?.verificationTier).toBeNull();
  });

  it("rejects bogus tier values with 400 and leaves the column unchanged", async () => {
    const admin = await createTestUser();
    const target = await createTestUser();
    createdUserIds.push(admin.id, target.id);
    await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, admin.id));
    authState.clerkId = admin.clerkId;

    const res = await request(app)
      .patch(`/api/admin/users/${target.id}/verification`)
      .send({ tier: "gold" });

    expect(res.status).toBe(400);
    const reloaded = await db.query.usersTable.findFirst({ where: eq(usersTable.id, target.id) });
    expect(reloaded?.verificationTier).toBeNull();
  });
});
