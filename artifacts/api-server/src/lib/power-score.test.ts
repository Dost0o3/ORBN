import { describe, it, expect, afterAll } from "vitest";
import {
  db,
  usersTable,
  followsTable,
  postsTable,
  likesTable,
  bountiesTable,
  bountySubmissionsTable,
  powerScoreSnapshotsTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import { recomputePowerScore, computeFromInputs, rankFor } from "./power-score";
import { createTestUser, deleteTestUsers, reloadUser } from "../test/test-helpers";

const createdUserIds: string[] = [];
const createdBountyIds: number[] = [];

afterAll(async () => {
  if (createdBountyIds.length > 0) {
    await db
      .delete(bountySubmissionsTable)
      .where(inArray(bountySubmissionsTable.bountyId, createdBountyIds))
      .catch(() => {});
    await db
      .delete(bountiesTable)
      .where(inArray(bountiesTable.id, createdBountyIds))
      .catch(() => {});
  }
  if (createdUserIds.length > 0) {
    await db
      .delete(powerScoreSnapshotsTable)
      .where(inArray(powerScoreSnapshotsTable.userId, createdUserIds))
      .catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("recomputePowerScore — formula correctness", () => {
  it("returns score=0 / RECRUIT for a brand-new zero-activity user", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const result = await recomputePowerScore(user.id);

    // Account age is 0 days (just created), and there is zero of everything else.
    expect(result.score).toBe(0);
    expect(result.rank).toBe("RECRUIT");
    expect(result.breakdown).toEqual({
      network: 0,
      content: 0,
      activity: 0,
      reputation: 0,
      streakBonus: 0,
      endorsementBonus: 0,
    });

    // The cached fields should match the freshly-computed values.
    const refreshed = await reloadUser(user.id);
    expect(refreshed?.powerScoreCached).toBe(0);
    expect(refreshed?.powerRankCached).toBe("RECRUIT");
  });

  it("reflects a bounty win in the winner's reputation score (+50 per win)", async () => {
    const poster = await createTestUser();
    const winner = await createTestUser();
    createdUserIds.push(poster.id, winner.id);

    const [bounty] = await db
      .insert(bountiesTable)
      .values({
        posterId: poster.id,
        title: "Test bounty",
        description: "desc",
        category: "test",
        reward: "10 USD",
        status: "open",
      })
      .returning();
    createdBountyIds.push(bounty.id);

    await db.insert(bountySubmissionsTable).values({
      bountyId: bounty.id,
      submitterId: winner.id,
      content: "win",
      link: null,
      isWinner: true,
    });

    const result = await recomputePowerScore(winner.id);

    // bountiesWon=1 → reputation = floor(1*50 + 0 + 0) = 50, capped at 200.
    // No other contributions.
    expect(result.breakdown.reputation).toBe(50);
    expect(result.breakdown.network).toBe(0);
    expect(result.breakdown.content).toBe(0);
    expect(result.breakdown.activity).toBe(0);
    expect(result.score).toBe(50);
    expect(result.rank).toBe("RECRUIT");
  });

  it("reflects a completed (claimed) bounty in the poster's reputation score (+20 per posted)", async () => {
    const poster = await createTestUser();
    const winner = await createTestUser();
    createdUserIds.push(poster.id, winner.id);

    const [bounty] = await db
      .insert(bountiesTable)
      .values({
        posterId: poster.id,
        title: "Test bounty 2",
        description: "desc",
        category: "test",
        reward: "10 USD",
        status: "claimed",
        winnerId: winner.id,
      })
      .returning();
    createdBountyIds.push(bounty.id);

    const result = await recomputePowerScore(poster.id);

    // bountiesPosted=1 (claimed), bountiesWon=0, no followers.
    // reputation = floor(0 + 1*20 + 0) = 20.
    expect(result.breakdown.reputation).toBe(20);
    expect(result.score).toBe(20);
  });

  it("computes the documented breakdown for a controlled mix of inputs", async () => {
    const author = await createTestUser();
    const f1 = await createTestUser();
    const f2 = await createTestUser();
    const f3 = await createTestUser();
    const liker = await createTestUser();
    createdUserIds.push(author.id, f1.id, f2.id, f3.id, liker.id);

    // 3 followers, 0 following → network = floor(3*2 + 0) = 6
    await db.insert(followsTable).values([
      { followerId: f1.id, followingId: author.id },
      { followerId: f2.id, followingId: author.id },
      { followerId: f3.id, followingId: author.id },
    ]);

    // 2 posts, each receives 1 like from `liker`
    // content = floor(2*8 + 2*1.5) = 16 + 3 = 19
    // activity = floor(2*2 + 0 + 0 + 0 + 0 + min(30, 0*0.1)) = 4
    // reputation = floor(0 + 0 + 3*0.5) = 1
    const [p1] = await db
      .insert(postsTable)
      .values({ authorId: author.id, content: "post 1" })
      .returning();
    const [p2] = await db
      .insert(postsTable)
      .values({ authorId: author.id, content: "post 2" })
      .returning();
    await db.insert(likesTable).values([
      { postId: p1.id, userId: liker.id },
      { postId: p2.id, userId: liker.id },
    ]);

    const result = await recomputePowerScore(author.id);

    expect(result.breakdown.network).toBe(6);
    expect(result.breakdown.content).toBe(19);
    expect(result.breakdown.activity).toBe(4);
    expect(result.breakdown.reputation).toBe(1);
    expect(result.breakdown.streakBonus).toBe(0);
    expect(result.breakdown.endorsementBonus).toBe(0);
    expect(result.score).toBe(6 + 19 + 4 + 1);
    expect(result.rank).toBe("RECRUIT");

    // The DB row + the snapshot row should match the returned result.
    const refreshed = await reloadUser(author.id);
    expect(refreshed?.powerScoreCached).toBe(result.score);
    expect(refreshed?.powerRankCached).toBe(result.rank);
  });
});

describe("computeFromInputs — edge cases", () => {
  it("caps each component and the total at the documented maxima", () => {
    // Inputs chosen so every component blows past its cap.
    const result = computeFromInputs({
      followers: 10_000,
      following: 10_000,
      posts: 1_000,
      likesReceived: 10_000,
      bountiesWon: 1_000,
      bountiesPosted: 1_000,
      communities: 1_000,
      jobApps: 1_000,
      circles: 1_000,
      accountAgeDays: 100_000,
      streak: 10_000,
      endorsements: 10_000,
    });

    expect(result.breakdown.network).toBe(300);
    expect(result.breakdown.content).toBe(300);
    expect(result.breakdown.activity).toBe(200);
    expect(result.breakdown.reputation).toBe(200);
    expect(result.breakdown.streakBonus).toBe(50);
    expect(result.breakdown.endorsementBonus).toBe(50);
    expect(result.score).toBe(1000);
    expect(result.rank).toBe("THE DON");
  });

  it("only adds the following bonus to network when followers > following", () => {
    const moreFollowers = computeFromInputs({
      followers: 10,
      following: 4,
      posts: 0,
      likesReceived: 0,
      bountiesWon: 0,
      bountiesPosted: 0,
      communities: 0,
      jobApps: 0,
      circles: 0,
      accountAgeDays: 0,
      streak: 0,
      endorsements: 0,
    });
    // network = floor(10*2 + 4*0.5) = 22
    expect(moreFollowers.breakdown.network).toBe(22);

    const equalFollowing = computeFromInputs({
      followers: 10,
      following: 10,
      posts: 0,
      likesReceived: 0,
      bountiesWon: 0,
      bountiesPosted: 0,
      communities: 0,
      jobApps: 0,
      circles: 0,
      accountAgeDays: 0,
      streak: 0,
      endorsements: 0,
    });
    // followers NOT > following → no bonus. network = floor(10*2) = 20.
    expect(equalFollowing.breakdown.network).toBe(20);
  });

  it("rankFor matches the documented thresholds", () => {
    expect(rankFor(0)).toBe("RECRUIT");
    expect(rankFor(199)).toBe("RECRUIT");
    expect(rankFor(200)).toBe("OPERATIVE");
    expect(rankFor(400)).toBe("RISING FORCE");
    expect(rankFor(600)).toBe("INNER CIRCLE");
    expect(rankFor(800)).toBe("THE DON");
    expect(rankFor(1000)).toBe("THE DON");
  });
});
