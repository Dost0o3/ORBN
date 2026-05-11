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
 * The /admin/users endpoints are how admins manage the moderator roster
 * in-product instead of editing the DB by hand. These tests pin the
 * load-bearing properties: only admins can call them, promote/demote
 * actually flips the column, the response carries the updated profile
 * (so the client can patch its cache without a follow-up GET), and the
 * server refuses to let an admin demote themselves (which would make the
 * roster screen impossible to recover from without DB access).
 */
describe("Admin roster management endpoints", () => {
  describe("GET /api/admin/users", () => {
    it("rejects non-admin callers with 403", async () => {
      const caller = await createTestUser();
      createdUserIds.push(caller.id);
      authState.clerkId = caller.clerkId;

      const res = await request(app).get("/api/admin/users?adminOnly=true");
      expect(res.status).toBe(403);
    });

    it("admin sees only admins when adminOnly=true", async () => {
      const admin = await createTestUser();
      const otherAdmin = await createTestUser();
      const regular = await createTestUser();
      createdUserIds.push(admin.id, otherAdmin.id, regular.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, otherAdmin.id));
      authState.clerkId = admin.clerkId;

      const res = await request(app).get("/api/admin/users?adminOnly=true&limit=100");
      expect(res.status).toBe(200);
      const ids = (res.body.users as Array<{ id: string }>).map((u) => u.id);
      expect(ids).toContain(admin.id);
      expect(ids).toContain(otherAdmin.id);
      expect(ids).not.toContain(regular.id);
    });

    it("admin search by q matches username case-insensitively", async () => {
      const admin = await createTestUser();
      const target = await createTestUser({
        displayName: `RosterSearchTarget_${Date.now()}`,
      });
      createdUserIds.push(admin.id, target.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      authState.clerkId = admin.clerkId;

      // Search by an uppercase slice of the displayName to also pin the
      // case-insensitive ILIKE behavior in the same test.
      const needle = target.displayName.toUpperCase().slice(0, 16);
      const res = await request(app).get(
        `/api/admin/users?q=${encodeURIComponent(needle)}`,
      );
      expect(res.status).toBe(200);
      const ids = (res.body.users as Array<{ id: string }>).map((u) => u.id);
      expect(ids).toContain(target.id);
    });
  });

  describe("PATCH /api/admin/users/:userId/admin", () => {
    it("rejects non-admin callers with 403", async () => {
      const caller = await createTestUser();
      const target = await createTestUser();
      createdUserIds.push(caller.id, target.id);
      authState.clerkId = caller.clerkId;

      const res = await request(app)
        .patch(`/api/admin/users/${target.id}/admin`)
        .send({ isAdmin: true });
      expect(res.status).toBe(403);
      const reloaded = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, target.id),
      });
      expect(reloaded?.isAdmin).toBe(false);
    });

    it("admin can promote a user and the response carries the updated profile", async () => {
      const admin = await createTestUser();
      const target = await createTestUser();
      createdUserIds.push(admin.id, target.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      authState.clerkId = admin.clerkId;

      const res = await request(app)
        .patch(`/api/admin/users/${target.id}/admin`)
        .send({ isAdmin: true });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(target.id);
      expect(res.body.isAdmin).toBe(true);
      const reloaded = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, target.id),
      });
      expect(reloaded?.isAdmin).toBe(true);
    });

    it("admin can demote another admin", async () => {
      const admin = await createTestUser();
      const target = await createTestUser();
      createdUserIds.push(admin.id, target.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, target.id));
      authState.clerkId = admin.clerkId;

      const res = await request(app)
        .patch(`/api/admin/users/${target.id}/admin`)
        .send({ isAdmin: false });
      expect(res.status).toBe(200);
      expect(res.body.isAdmin).toBe(false);
      const reloaded = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, target.id),
      });
      expect(reloaded?.isAdmin).toBe(false);
    });

    it("admin cannot demote themselves (400) and the column is unchanged", async () => {
      const admin = await createTestUser();
      createdUserIds.push(admin.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      authState.clerkId = admin.clerkId;

      const res = await request(app)
        .patch(`/api/admin/users/${admin.id}/admin`)
        .send({ isAdmin: false });
      expect(res.status).toBe(400);
      const reloaded = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, admin.id),
      });
      expect(reloaded?.isAdmin).toBe(true);
    });

    it("returns 404 when target user does not exist", async () => {
      const admin = await createTestUser();
      createdUserIds.push(admin.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      authState.clerkId = admin.clerkId;

      const res = await request(app)
        .patch("/api/admin/users/00000000-0000-0000-0000-000000000000/admin")
        .send({ isAdmin: true });
      expect(res.status).toBe(404);
    });

    it("rejects malformed body with 400", async () => {
      const admin = await createTestUser();
      const target = await createTestUser();
      createdUserIds.push(admin.id, target.id);
      await db.update(usersTable).set({ isAdmin: true })
        .where(eq(usersTable.id, admin.id));
      authState.clerkId = admin.clerkId;

      const res = await request(app)
        .patch(`/api/admin/users/${target.id}/admin`)
        .send({ isAdmin: "yes-please" });
      expect(res.status).toBe(400);
    });
  });
});
