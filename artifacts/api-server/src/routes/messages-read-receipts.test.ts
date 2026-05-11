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
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
  makeApp,
} from "../test/test-helpers";
import { subscribe } from "../lib/sse-bus";
import type { Response } from "express";

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

interface DmReadEvent {
  type: "read";
  conversationId: number;
  readerId: string;
  messageIds: number[];
  at: string;
}

/**
 * Subscribes to the dm-inbox SSE channel for `userId` and returns the list
 * of read-events captured so far plus an unsubscribe handle. The bus writes
 * `data: <json>\n\n` frames into the Response — we intercept `write` and
 * parse the JSON payload back into a typed event so the test can assert on
 * its shape without dealing with raw SSE wire format.
 */
function captureReadEvents(userId: string): {
  events: DmReadEvent[];
  unsubscribe: () => void;
} {
  const events: DmReadEvent[] = [];
  const fakeRes = {
    write(chunk: string): boolean {
      const match = chunk.match(/^data: (.*)\n\n$/s);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.type === "read") events.push(parsed as DmReadEvent);
        } catch {
          /* ignore non-JSON frames */
        }
      }
      return true;
    },
  } as unknown as Response;
  const unsubscribe = subscribe("dm-inbox", userId, fakeRes);
  return { events, unsubscribe };
}

async function makeConversation(): Promise<{
  caller: Awaited<ReturnType<typeof createTestUser>>;
  peer: Awaited<ReturnType<typeof createTestUser>>;
  convId: number;
}> {
  const a = await createTestUser();
  const b = await createTestUser();
  createdUserIds.push(a.id, b.id);
  // The schema stores user1Id < user2Id (lexicographic) for the unique pair.
  const [u1, u2] = a.id < b.id ? [a, b] : [b, a];
  const [conv] = await db
    .insert(directConversationsTable)
    .values({ user1Id: u1.id, user2Id: u2.id })
    .returning();
  createdConvIds.push(conv.id);
  return { caller: a, peer: b, convId: conv.id };
}

describe("GET /api/conversations/:id/messages — read receipts", () => {
  it("marks unread messages read AND publishes a `read` event to the original sender", async () => {
    const { caller, peer, convId } = await makeConversation();
    // Two unread messages from the peer to the caller — the caller's
    // GET should flip both to read and notify the peer once with both ids.
    const inserted = await db
      .insert(directMessagesTable)
      .values([
        { conversationId: convId, senderId: peer.id, recipientId: caller.id, content: "hi" },
        { conversationId: convId, senderId: peer.id, recipientId: caller.id, content: "still there?" },
      ])
      .returning();
    const insertedIds = inserted.map((m) => m.id).sort((x, y) => x - y);

    const { events, unsubscribe } = captureReadEvents(peer.id);
    try {
      authState.clerkId = caller.clerkId;
      const res = await request(app).get(`/api/conversations/${convId}/messages`);
      expect(res.status).toBe(200);
    } finally {
      unsubscribe();
    }

    // DB side-effect: both messages now have a non-null readAt for the recipient.
    const readRows = await db
      .select({ id: directMessagesTable.id })
      .from(directMessagesTable)
      .where(
        and(
          eq(directMessagesTable.conversationId, convId),
          eq(directMessagesTable.recipientId, caller.id),
          isNotNull(directMessagesTable.readAt),
        ),
      );
    expect(readRows.map((r) => r.id).sort((a, b) => a - b)).toEqual(insertedIds);

    // SSE side-effect: exactly one event, addressed to the peer (the original
    // sender), carrying both newly-read message ids and the right metadata.
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBe("read");
    expect(ev.conversationId).toBe(convId);
    expect(ev.readerId).toBe(caller.id);
    expect([...ev.messageIds].sort((a, b) => a - b)).toEqual(insertedIds);
    expect(typeof ev.at).toBe("string");
    expect(Number.isFinite(Date.parse(ev.at))).toBe(true);
  });

  it("does NOT publish a `read` event when there are no unread messages to mark", async () => {
    const { caller, peer, convId } = await makeConversation();
    // Pre-mark the only message as already read so the GET has no work to do.
    const alreadyRead = new Date(Date.now() - 60_000);
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "old news",
      readAt: alreadyRead,
    });

    const { events, unsubscribe } = captureReadEvents(peer.id);
    try {
      authState.clerkId = caller.clerkId;
      const res = await request(app).get(`/api/conversations/${convId}/messages`);
      expect(res.status).toBe(200);
    } finally {
      unsubscribe();
    }
    expect(events).toHaveLength(0);
  });

  it("still marks messages read locally but suppresses the `read` event when the reader has receipts disabled (task #68)", async () => {
    const { caller, peer, convId } = await makeConversation();
    // Reader (caller) has receipts off — DB update must still happen so
    // their unread badge clears, but the SSE channel must stay silent.
    const { db: dbHandle, usersTable } = await import("@workspace/db");
    await dbHandle
      .update(usersTable)
      .set({ readReceiptsEnabled: false })
      .where(eq(usersTable.id, caller.id));

    const [msg] = await db
      .insert(directMessagesTable)
      .values({ conversationId: convId, senderId: peer.id, recipientId: caller.id, content: "ping" })
      .returning();

    const { events, unsubscribe } = captureReadEvents(peer.id);
    try {
      authState.clerkId = caller.clerkId;
      const res = await request(app).get(`/api/conversations/${convId}/messages`);
      expect(res.status).toBe(200);
    } finally {
      unsubscribe();
    }

    // No SSE leak.
    expect(events).toHaveLength(0);
    // But the local read state was still updated.
    const [row] = await db
      .select({ readAt: directMessagesTable.readAt })
      .from(directMessagesTable)
      .where(eq(directMessagesTable.id, msg.id));
    expect(row.readAt).not.toBeNull();
  });
});
