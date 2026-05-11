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

afterAll(async () => {
  if (createdConvIds.length > 0) {
    await db
      .delete(directConversationsTable)
      .where(inArray(directConversationsTable.id, createdConvIds))
      .catch(() => {});
  }
  await deleteTestUsers(createdUserIds);
});

beforeAll(() => {
  authState.clerkId = null;
});

async function makeConversation(): Promise<{
  caller: Awaited<ReturnType<typeof createTestUser>>;
  peer: Awaited<ReturnType<typeof createTestUser>>;
  convId: number;
}> {
  const a = await createTestUser();
  const b = await createTestUser();
  createdUserIds.push(a.id, b.id);
  // direct_conversations expects user1Id < user2Id (lexicographic).
  const [u1, u2] = a.id < b.id ? [a, b] : [b, a];
  const [conv] = await db
    .insert(directConversationsTable)
    .values({ user1Id: u1.id, user2Id: u2.id })
    .returning();
  createdConvIds.push(conv.id);
  return { caller: a, peer: b, convId: conv.id };
}

describe("GET /api/conversations/:id/messages — self-destruct placeholder", () => {
  it("returns expired self-destructing messages with content scrubbed and expired:true", async () => {
    const { caller, peer, convId } = await makeConversation();
    const past = new Date(Date.now() - 60_000); // 1 minute ago
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "TOP SECRET — should never reach the client",
      expiresAt: past,
    });

    authState.clerkId = caller.clerkId;
    const res = await request(app).get(
      `/api/conversations/${convId}/messages`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBe(1);
    const msg = res.body.messages[0];
    expect(msg.expired).toBe(true);
    expect(msg.content).toBe("");
    // Sanity: the original sensitive text must not leak through any field.
    expect(JSON.stringify(msg)).not.toContain("TOP SECRET");
  });

  it("returns non-expired messages unchanged with expired:false", async () => {
    const { caller, peer, convId } = await makeConversation();
    const future = new Date(Date.now() + 60 * 60_000); // +1h
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "still alive",
      expiresAt: future,
    });
    // And one with no expiresAt at all.
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "no expiry",
      expiresAt: null,
    });

    authState.clerkId = caller.clerkId;
    const res = await request(app).get(
      `/api/conversations/${convId}/messages`,
    );
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(2);
    for (const m of res.body.messages) {
      expect(m.expired).toBe(false);
    }
    const contents = res.body.messages.map((m: { content: string }) => m.content).sort();
    expect(contents).toEqual(["no expiry", "still alive"]);
  });
});
