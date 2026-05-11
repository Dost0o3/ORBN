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

import messagesRouter from "./messages";
import {
  db,
  directConversationsTable,
  directMessagesTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
} from "../test/test-helpers";

const app = makeApp(messagesRouter);
const createdUserIds: string[] = [];
const createdConvIds: number[] = [];

beforeAll(() => {
  authState.clerkId = null;
});

afterAll(async () => {
  if (createdConvIds.length > 0) {
    await db
      .delete(directConversationsTable)
      .where(inArray(directConversationsTable.id, createdConvIds))
      .catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

async function makeConversation(): Promise<{
  caller: Awaited<ReturnType<typeof createTestUser>>;
  peer: Awaited<ReturnType<typeof createTestUser>>;
  convId: number;
}> {
  const a = await createTestUser();
  const b = await createTestUser();
  createdUserIds.push(a.id, b.id);
  const [u1, u2] = a.id < b.id ? [a, b] : [b, a];
  const [conv] = await db
    .insert(directConversationsTable)
    .values({ user1Id: u1.id, user2Id: u2.id })
    .returning();
  createdConvIds.push(conv.id);
  return { caller: a, peer: b, convId: conv.id };
}

describe("GET /api/conversations — expired-message preview filter", () => {
  it("never picks an expired self-destructing message as the lastMessage preview, even when it is the most recent row", async () => {
    const { caller, peer, convId } = await makeConversation();

    // Insert the FRESH preview-worthy message FIRST (older createdAt). Then
    // insert an EXPIRED message with a NEWER createdAt. Without the
    // notExpiredFilter on the lastMessage query, the expired row would win
    // (it sorts first by `createdAt DESC`), so this layout truly locks the
    // filter behaviour — not just the ordering.
    const fresh = new Date(Date.now() - 10 * 60_000); // 10 min ago
    const newer = new Date(Date.now() - 60_000); // 1 min ago
    const past = new Date(Date.now() - 30_000); // 30 s ago (already expired)

    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "fresh preview text",
      createdAt: fresh,
      expiresAt: null,
    });
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "TOP SECRET expired preview — should never leak",
      createdAt: newer,
      expiresAt: past,
    });

    authState.clerkId = caller.clerkId;
    const res = await request(app).get("/api/conversations");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.conversations)).toBe(true);

    const row = res.body.conversations.find(
      (c: { id: number }) => c.id === convId,
    );
    expect(row).toBeDefined();
    expect(row.lastMessage).not.toBeNull();
    expect(row.lastMessage.content).toBe("fresh preview text");
    // Belt-and-braces: the expired text must not appear anywhere in the row.
    expect(JSON.stringify(row)).not.toContain("TOP SECRET");
  });

  it("returns lastMessage:null when every message in the conversation has already expired", async () => {
    const { caller, peer, convId } = await makeConversation();
    const past = new Date(Date.now() - 60_000);
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "TOP SECRET only-message expired",
      expiresAt: past,
    });

    authState.clerkId = caller.clerkId;
    const res = await request(app).get("/api/conversations");
    expect(res.status).toBe(200);
    const row = res.body.conversations.find(
      (c: { id: number }) => c.id === convId,
    );
    expect(row).toBeDefined();
    expect(row.lastMessage).toBeNull();
    // And the unread count must not include the expired one either, since
    // notExpiredFilter is applied to that subquery too.
    expect(row.unreadCount).toBe(0);
    expect(JSON.stringify(row)).not.toContain("TOP SECRET");
  });
});
