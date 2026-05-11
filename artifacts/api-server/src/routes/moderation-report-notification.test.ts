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
import {
  db,
  notificationsTable,
  userReportsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { createTestUser, deleteTestUsers, makeApp } from "../test/test-helpers";

const app = makeApp(usersRouter, moderationRouter);
const createdUserIds: string[] = [];
const createdReportIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  // notificationsTable.userId and userReportsTable.{reporterId,reportedId}
  // both cascade on user delete, so removing the test users is enough to
  // clear every row this suite created — no manual sweep needed.
  await deleteTestUsers(createdUserIds);
});

async function makeAdmin(): Promise<{ id: string; clerkId: string }> {
  const u = await createTestUser();
  await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, u.id));
  createdUserIds.push(u.id);
  return { id: u.id, clerkId: u.clerkId };
}

async function fileReport(reporterId: string, reportedId: string): Promise<number> {
  const [row] = await db
    .insert(userReportsTable)
    .values({ reporterId, reportedId, reason: "spam", status: "pending" })
    .returning();
  createdReportIds.push(row.id);
  return row.id;
}

async function notifsFor(userId: string) {
  return db.select().from(notificationsTable).where(eq(notificationsTable.userId, userId));
}

/**
 * When a moderator marks a report as "actioned" or "dismissed", the original
 * reporter should learn that their report was reviewed. These tests pin the
 * load-bearing properties: the right reporter is notified, the type matches
 * the outcome, no notification is created on a no-op (re-saving the same
 * status), and other status transitions don't fire one.
 */
describe("PATCH /api/moderation/reports/:reportId — reporter notification", () => {
  it("notifies the reporter when a report is marked actioned", async () => {
    const admin = await makeAdmin();
    const reporter = await createTestUser();
    const reported = await createTestUser({ displayName: "Spammy McSpam" });
    createdUserIds.push(reporter.id, reported.id);
    const reportId = await fileReport(reporter.id, reported.id);

    authState.clerkId = admin.clerkId;
    const res = await request(app)
      .patch(`/api/moderation/reports/${reportId}`)
      .send({ status: "actioned" });
    expect(res.status).toBe(200);

    const notifs = await notifsFor(reporter.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("report_actioned");
    expect(notifs[0].actorId).toBe(admin.id);
    expect(notifs[0].read).toBe(false);
    expect(notifs[0].message).toContain("Spammy McSpam");
    expect(notifs[0].metadata).toMatchObject({
      reportId,
      reportedId: reported.id,
    });
  });

  it("notifies the reporter with a softer message when a report is dismissed", async () => {
    const admin = await makeAdmin();
    const reporter = await createTestUser();
    const reported = await createTestUser({ displayName: "Borderline Bob" });
    createdUserIds.push(reporter.id, reported.id);
    const reportId = await fileReport(reporter.id, reported.id);

    authState.clerkId = admin.clerkId;
    const res = await request(app)
      .patch(`/api/moderation/reports/${reportId}`)
      .send({ status: "dismissed" });
    expect(res.status).toBe(200);

    const notifs = await notifsFor(reporter.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("report_dismissed");
    expect(notifs[0].message).toContain("No action was taken");
  });

  it("does not double-notify when the same terminal status is re-saved", async () => {
    const admin = await makeAdmin();
    const reporter = await createTestUser();
    const reported = await createTestUser();
    createdUserIds.push(reporter.id, reported.id);
    const reportId = await fileReport(reporter.id, reported.id);

    authState.clerkId = admin.clerkId;
    await request(app)
      .patch(`/api/moderation/reports/${reportId}`)
      .send({ status: "actioned" });
    await request(app)
      .patch(`/api/moderation/reports/${reportId}`)
      .send({ status: "actioned" });

    const notifs = await notifsFor(reporter.id);
    expect(notifs).toHaveLength(1);
  });

  it("does not notify on a transition into the non-terminal 'reviewed' status", async () => {
    const admin = await makeAdmin();
    const reporter = await createTestUser();
    const reported = await createTestUser();
    createdUserIds.push(reporter.id, reported.id);
    const reportId = await fileReport(reporter.id, reported.id);

    authState.clerkId = admin.clerkId;
    const res = await request(app)
      .patch(`/api/moderation/reports/${reportId}`)
      .send({ status: "reviewed" });
    expect(res.status).toBe(200);

    const notifs = await notifsFor(reporter.id);
    expect(notifs).toHaveLength(0);
  });

  it("does not notify when an admin actions their own report", async () => {
    const admin = await makeAdmin();
    const reported = await createTestUser();
    createdUserIds.push(reported.id);
    const reportId = await fileReport(admin.id, reported.id);

    authState.clerkId = admin.clerkId;
    await request(app)
      .patch(`/api/moderation/reports/${reportId}`)
      .send({ status: "actioned" });

    const notifs = await notifsFor(admin.id);
    expect(notifs).toHaveLength(0);
  });
});
