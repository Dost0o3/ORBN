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
import bountiesRouter from "./bounties";
import { db, bountiesTable, bountySubmissionsTable, notificationsTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
  reloadUser,
  waitForCondition,
} from "../test/test-helpers";

const app = makeApp(usersRouter, bountiesRouter);
const createdUserIds: string[] = [];
const createdBountyIds: number[] = [];

afterAll(async () => {
  if (createdBountyIds.length > 0) {
    await db.delete(bountySubmissionsTable).where(inArray(bountySubmissionsTable.bountyId, createdBountyIds)).catch(() => {});
    await db.delete(notificationsTable).where(inArray(notificationsTable.postId, createdBountyIds)).catch(() => {});
    await db.delete(bountiesTable).where(inArray(bountiesTable.id, createdBountyIds)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("PUT /api/bounties/:id/submissions/:subId/winner — recompute both scores", () => {
  it("triggers power-score recompute for BOTH the winner and the poster", async () => {
    // Create poster + winner with NO cached score yet — that's how we'll
    // detect that recompute actually ran (cached fields populate).
    const poster = await createTestUser({ powerScoreCached: null, powerScoreCachedAt: null });
    const winner = await createTestUser({ powerScoreCached: null, powerScoreCachedAt: null });
    createdUserIds.push(poster.id, winner.id);

    const [bounty] = await db.insert(bountiesTable).values({
      posterId: poster.id,
      title: "Bounty test",
      description: "Test description",
      category: "test",
      reward: "100 USD",
      status: "open",
    }).returning();
    createdBountyIds.push(bounty.id);

    const [submission] = await db.insert(bountySubmissionsTable).values({
      bountyId: bounty.id,
      submitterId: winner.id,
      content: "winning submission",
      link: null,
      isWinner: false,
    }).returning();

    // Authenticate as the poster (only the poster can choose a winner).
    authState.clerkId = poster.clerkId;

    const res = await request(app).put(`/api/bounties/${bounty.id}/submissions/${submission.id}/winner`);
    expect(res.status).toBe(200);
    expect(res.body.isWinner).toBe(true);
    expect(res.body.submitter.id).toBe(winner.id);

    // The recompute is fire-and-forget (Promise.all([...]).catch(() => {})),
    // so we poll until both users have a cached score before asserting. If
    // either side never updates, this throws and the test fails — exactly
    // the regression the task is asking for.
    await waitForCondition(async () => {
      const [p, w] = await Promise.all([reloadUser(poster.id), reloadUser(winner.id)]);
      return (
        p?.powerScoreCached != null &&
        p?.powerScoreCachedAt != null &&
        w?.powerScoreCached != null &&
        w?.powerScoreCachedAt != null
      );
    }, 8000);

    const refreshedPoster = await reloadUser(poster.id);
    const refreshedWinner = await reloadUser(winner.id);

    expect(refreshedPoster?.powerScoreCached).not.toBeNull();
    expect(refreshedPoster?.powerRankCached).toBeTruthy();
    expect(refreshedWinner?.powerScoreCached).not.toBeNull();
    expect(refreshedWinner?.powerRankCached).toBeTruthy();

    // Bounty itself should now be marked claimed with the winner attached.
    const finalBounty = await db.query.bountiesTable.findFirst({ where: eq(bountiesTable.id, bounty.id) });
    expect(finalBounty?.status).toBe("claimed");
    expect(finalBounty?.winnerId).toBe(winner.id);
  });
});
