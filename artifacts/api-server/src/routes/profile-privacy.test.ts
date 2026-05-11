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
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
} from "../test/test-helpers";

interface ProfileResponse {
  id: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
}

const app = makeApp(usersRouter);
const createdUserIds: string[] = [];

const PRIVATE_FIELDS = {
  email: "private@example.com",
  phone: "+15551234567",
  gender: "nonbinary",
} as const;

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe("GET /api/users/:userId — profile-field privacy", () => {
  it("strips email/phone/gender from a non-owner viewer", async () => {
    const owner = await createTestUser(PRIVATE_FIELDS);
    const viewer = await createTestUser();
    createdUserIds.push(owner.id, viewer.id);

    authState.clerkId = viewer.clerkId;
    const res = await request(app).get(`/api/users/${owner.id}`);
    expect(res.status).toBe(200);
    const body: ProfileResponse = res.body;
    expect(body.id).toBe(owner.id);
    expect(body.email).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.gender).toBeNull();
    // Defense in depth: serialized response must not contain the raw private values.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(PRIVATE_FIELDS.email);
    expect(serialized).not.toContain(PRIVATE_FIELDS.phone);
    expect(serialized).not.toContain(PRIVATE_FIELDS.gender);
  });

  it("strips email/phone/gender from an unauthenticated viewer", async () => {
    const owner = await createTestUser(PRIVATE_FIELDS);
    createdUserIds.push(owner.id);

    authState.clerkId = null;
    const res = await request(app).get(`/api/users/${owner.id}`);
    expect(res.status).toBe(200);
    const body: ProfileResponse = res.body;
    expect(body.email).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.gender).toBeNull();
  });

  it("returns email/phone/gender to the owner viewing their own profile", async () => {
    const owner = await createTestUser(PRIVATE_FIELDS);
    createdUserIds.push(owner.id);

    authState.clerkId = owner.clerkId;
    const res = await request(app).get(`/api/users/${owner.id}`);
    expect(res.status).toBe(200);
    const body: ProfileResponse = res.body;
    expect(body.email).toBe(PRIVATE_FIELDS.email);
    expect(body.phone).toBe(PRIVATE_FIELDS.phone);
    expect(body.gender).toBe(PRIVATE_FIELDS.gender);
  });
});

describe("GET /api/users/by-username/:username — profile-field privacy", () => {
  it("strips email/phone/gender from a non-owner viewer", async () => {
    const owner = await createTestUser(PRIVATE_FIELDS);
    const viewer = await createTestUser();
    createdUserIds.push(owner.id, viewer.id);

    authState.clerkId = viewer.clerkId;
    const res = await request(app).get(`/api/users/by-username/${owner.username}`);
    expect(res.status).toBe(200);
    const body: ProfileResponse = res.body;
    expect(body.id).toBe(owner.id);
    expect(body.email).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.gender).toBeNull();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(PRIVATE_FIELDS.email);
    expect(serialized).not.toContain(PRIVATE_FIELDS.phone);
    expect(serialized).not.toContain(PRIVATE_FIELDS.gender);
  });

  it("strips email/phone/gender from an unauthenticated viewer", async () => {
    const owner = await createTestUser(PRIVATE_FIELDS);
    createdUserIds.push(owner.id);

    authState.clerkId = null;
    const res = await request(app).get(`/api/users/by-username/${owner.username}`);
    expect(res.status).toBe(200);
    const body: ProfileResponse = res.body;
    expect(body.email).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.gender).toBeNull();
  });

  it("returns email/phone/gender to the owner viewing their own profile by username", async () => {
    const owner = await createTestUser(PRIVATE_FIELDS);
    createdUserIds.push(owner.id);

    authState.clerkId = owner.clerkId;
    const res = await request(app).get(`/api/users/by-username/${owner.username}`);
    expect(res.status).toBe(200);
    const body: ProfileResponse = res.body;
    expect(body.email).toBe(PRIVATE_FIELDS.email);
    expect(body.phone).toBe(PRIVATE_FIELDS.phone);
    expect(body.gender).toBe(PRIVATE_FIELDS.gender);
  });
});
