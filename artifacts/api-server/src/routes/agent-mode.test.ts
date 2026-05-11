import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
import { db, usersTable, soulTwinActionsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
  reloadUser,
} from "../test/test-helpers";

const app = makeApp(usersRouter, agentRouter);
const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

beforeAll(() => {
  authState.clerkId = null;
});

describe("POST /api/users/me/agent-mode — consent gate", () => {
  it("rejects enabled:true without prior consent or inline consent", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).post("/api/users/me/agent-mode").send({ enabled: true });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.toLowerCase()).toContain("consent");

    // DB state must be unchanged.
    const reloaded = await reloadUser(user.id);
    expect(reloaded?.agentModeEnabled).toBe(false);
    expect(reloaded?.agentConsentedAt).toBeNull();
  });

  it("accepts enabled:true with inline consent and stamps agentConsentedAt", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).post("/api/users/me/agent-mode").send({ enabled: true, consent: true });
    expect(res.status).toBe(200);
    expect(res.body.agentModeEnabled).toBe(true);
    expect(res.body.agentConsentedAt).toBeTruthy();

    const reloaded = await reloadUser(user.id);
    expect(reloaded?.agentConsentedAt).toBeInstanceOf(Date);
  });

  it("permits subsequent toggles once consent is on file", async () => {
    const user = await createTestUser({ agentConsentedAt: new Date(), agentModeEnabled: false });
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).post("/api/users/me/agent-mode").send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.agentModeEnabled).toBe(true);
  });

  it("rejects autonomy when consent is missing (no autonomy without consent)", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app)
      .post("/api/users/me/agent-mode")
      .send({ enabled: true, autonomy: true });
    expect(res.status).toBe(400);

    const reloaded = await reloadUser(user.id);
    expect(reloaded?.agentAutonomyEnabled).toBe(false);
  });
});

describe("POST /api/ai/soul-twin/agent/* — consent gate", () => {
  const consentRoutes = [
    { method: "post", path: "/api/ai/soul-twin/agent/scan", body: {} },
    {
      method: "post",
      path: "/api/ai/soul-twin/agent/draft-dm",
      body: { targetUserId: "any" },
    },
    {
      method: "post",
      path: "/api/ai/soul-twin/agent/queue",
      body: { kind: "follow", payload: {}, targetUserId: "any" },
    },
    {
      method: "post",
      path: "/api/ai/soul-twin/agent/queue/1/approve",
      body: {},
    },
    {
      method: "post",
      path: "/api/ai/soul-twin/agent/queue/1/reject",
      body: {},
    },
  ] as const;

  it.each(consentRoutes)("returns 403 when neither consent nor agentMode set: $path", async ({ path, body }) => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(403);
    expect(typeof res.body.error).toBe("string");
  });

  it.each(consentRoutes)("returns 403 when agentMode on but consent missing: $path", async ({ path, body }) => {
    const user = await createTestUser({ agentModeEnabled: true, agentConsentedAt: null });
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(403);
  });

  it.each(consentRoutes)("returns 403 when consent set but agentMode off: $path", async ({ path, body }) => {
    const user = await createTestUser({ agentModeEnabled: false, agentConsentedAt: new Date() });
    createdUserIds.push(user.id);
    authState.clerkId = user.clerkId;

    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(403);
  });

  // GET /queue is intentionally NOT consent-gated — it only requires auth,
  // so users can inspect their action history (including past actions queued
  // before they turned agent mode off). This block locks that contract in
  // so a future change can't accidentally either (a) drop the auth check or
  // (b) start gating the read path on consent and break legacy clients.
  describe("GET /api/ai/soul-twin/agent/queue (read-only, auth-only)", () => {
    it("returns 401 when the request is unauthenticated", async () => {
      authState.clerkId = null;
      const res = await request(app).get("/api/ai/soul-twin/agent/queue");
      expect(res.status).toBe(401);
    });

    it("returns 200 with auth even when consent + agentMode are both unset", async () => {
      const user = await createTestUser({ agentModeEnabled: false, agentConsentedAt: null });
      createdUserIds.push(user.id);
      authState.clerkId = user.clerkId;

      const res = await request(app).get("/api/ai/soul-twin/agent/queue");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.actions)).toBe(true);
    });

    it("returns 200 with auth when both consent + agentMode are set", async () => {
      const user = await createTestUser({ agentModeEnabled: true, agentConsentedAt: new Date() });
      createdUserIds.push(user.id);
      authState.clerkId = user.clerkId;

      const res = await request(app).get("/api/ai/soul-twin/agent/queue");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.actions)).toBe(true);
    });
  });

  it("permits a queue write when both consent + agentMode are set", async () => {
    // Caller has consent + agentMode; target is just another user to follow.
    const caller = await createTestUser({ agentModeEnabled: true, agentConsentedAt: new Date() });
    const target = await createTestUser();
    createdUserIds.push(caller.id, target.id);
    authState.clerkId = caller.clerkId;

    const res = await request(app)
      .post("/api/ai/soul-twin/agent/queue")
      .send({ kind: "follow", payload: {}, targetUserId: target.id });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(caller.id);
    expect(res.body.kind).toBe("follow");

    // Cleanup the inserted action so it doesn't leak across tests.
    await db
      .delete(soulTwinActionsTable)
      .where(and(eq(soulTwinActionsTable.userId, caller.id)));
  });
});
