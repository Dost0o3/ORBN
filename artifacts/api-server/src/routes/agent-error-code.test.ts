import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";

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

import { db, soulTwinActionsTable, directBlocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createTestUser, deleteTestUsers } from "../test/test-helpers";
import {
  classifyExecutionError,
  executeApprovedAction,
  RETRYABLE_ERROR_CODES,
  UnknownAgentActionKindError,
} from "../lib/agent-actions";
import { DirectMessageBlockedError } from "../lib/dm-helpers";
import { PostHelperValidationError } from "../lib/post-helpers";

const createdUserIds: string[] = [];
const seededActionIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  for (const id of seededActionIds) {
    await db.delete(soulTwinActionsTable).where(eq(soulTwinActionsTable.id, id)).catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

describe("classifyExecutionError", () => {
  it("maps DirectMessageBlockedError to recipient_blocked (permanent)", () => {
    const code = classifyExecutionError(new DirectMessageBlockedError());
    expect(code).toBe("recipient_blocked");
    expect(RETRYABLE_ERROR_CODES.has(code)).toBe(false);
  });

  it("maps PostHelperValidationError(400) to content_rejected and (404) to recipient_not_found", () => {
    expect(classifyExecutionError(new PostHelperValidationError("Content required", 400))).toBe("content_rejected");
    expect(classifyExecutionError(new PostHelperValidationError("Target post not found", 404))).toBe("recipient_not_found");
  });

  it("maps UnknownAgentActionKindError to unknown_kind (permanent)", () => {
    const code = classifyExecutionError(new UnknownAgentActionKindError("widget"));
    expect(code).toBe("unknown_kind");
    expect(RETRYABLE_ERROR_CODES.has(code)).toBe(false);
  });

  it("falls back to internal (retryable) for unrecognised errors", () => {
    const code = classifyExecutionError(new Error("kaboom: db connection lost"));
    expect(code).toBe("internal");
    expect(RETRYABLE_ERROR_CODES.has(code)).toBe(true);
  });

  it("recognises rate-limit messages from upstream", () => {
    expect(classifyExecutionError(new Error("OpenAI rate limit exceeded"))).toBe("rate_limited");
  });
});

describe("executeApprovedAction error persistence", () => {
  it("stamps lastErrorCode='recipient_blocked' on first attempt while preserving status='approved' (give-up handled by sweep)", async () => {
    const sender = await createTestUser({ agentModeEnabled: true, agentConsentedAt: new Date() });
    const recipient = await createTestUser();
    createdUserIds.push(sender.id, recipient.id);

    // Recipient blocks the sender → sendDirectMessage will throw
    // DirectMessageBlockedError, which classifies as a permanent code.
    await db.insert(directBlocksTable).values({ blockerId: recipient.id, blockedId: sender.id });

    const [row] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: sender.id,
        kind: "dm",
        status: "approved",
        targetUserId: recipient.id,
        payload: { content: "hello there" },
        resolvedAt: new Date(),
      })
      .returning();
    seededActionIds.push(row.id);

    await expect(executeApprovedAction(row)).rejects.toBeInstanceOf(DirectMessageBlockedError);

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, row.id),
    });
    expect(after?.lastErrorCode).toBe("recipient_blocked");
    expect(after?.lastError).toMatch(/blocked/i);
    // Autonomy contract: first-attempt failures stay status="approved"
    // with executedAt=null. The background sweep (covered separately)
    // is responsible for flipping permanent-coded rows to "failed".
    expect(after?.status).toBe("approved");
    expect(after?.executedAt).toBeNull();

    await db.delete(directBlocksTable)
      .where(eq(directBlocksTable.blockerId, recipient.id))
      .catch(() => {});
  });

  it("stamps lastErrorCode='recipient_not_found' for missing target post (permanent)", async () => {
    const caller = await createTestUser({ agentModeEnabled: true, agentConsentedAt: new Date() });
    createdUserIds.push(caller.id);

    const [row] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: caller.id,
        kind: "comment",
        status: "approved",
        targetPostId: 0x7fffffff, // bogus
        payload: { content: "missing post" },
        resolvedAt: new Date(),
      })
      .returning();
    seededActionIds.push(row.id);

    await expect(executeApprovedAction(row)).rejects.toThrow();

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, row.id),
    });
    expect(after?.lastErrorCode).toBe("recipient_not_found");
    expect(after?.status).toBe("approved");
    expect(after?.executedAt).toBeNull();
  });
});

describe("agent retry sweep + permanent error codes", () => {
  it("flips a permanent-coded row to status='failed' without burning another attempt", async () => {
    const { runAgentRetrySweep } = await import("../lib/agent-retry");

    const caller = await createTestUser({ agentModeEnabled: true, agentConsentedAt: new Date() });
    createdUserIds.push(caller.id);

    // Seed a row that already failed once with a permanent code, with a
    // back-dated lastAttemptAt so it's eligible for the sweep.
    const longAgo = new Date(Date.now() - 60 * 60_000);
    const [seeded] = await db
      .insert(soulTwinActionsTable)
      .values({
        userId: caller.id,
        kind: "comment",
        status: "approved",
        targetPostId: 0x7fffffff,
        payload: { content: `sweep-permanent-${Date.now()}` },
        executedAt: null,
        attemptCount: 1,
        lastAttemptAt: longAgo,
        resolvedAt: longAgo,
        lastError: "Target post not found",
        lastErrorCode: "recipient_not_found",
      })
      .returning();
    seededActionIds.push(seeded.id);

    const result = await runAgentRetrySweep();
    expect(result.gaveUpCount).toBeGreaterThanOrEqual(1);

    const after = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, seeded.id),
    });
    // Permanent code → flipped to failed by the sweep, attemptCount NOT
    // bumped (no real attempt was made — we just gave up).
    expect(after?.status).toBe("failed");
    expect(after?.attemptCount).toBe(1);
    expect(after?.lastErrorCode).toBe("recipient_not_found");
  });
});
