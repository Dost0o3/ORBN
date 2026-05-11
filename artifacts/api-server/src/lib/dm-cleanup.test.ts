import { describe, it, expect, afterAll } from "vitest";
import {
  db,
  directConversationsTable,
  directMessagesTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  createTestUser,
  deleteTestUsers,
} from "../test/test-helpers";
import { runExpiredDirectMessagesCleanup } from "./dm-cleanup";

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

async function makeConversation() {
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

describe("runExpiredDirectMessagesCleanup", () => {
  it("deletes only rows whose expiresAt is in the past, leaving fresh and never-expiring rows untouched", async () => {
    const { caller, peer, convId } = await makeConversation();

    const past = new Date(Date.now() - 60_000); // 1 min ago
    const future = new Date(Date.now() + 60 * 60_000); // +1 h

    const [expiredRow] = await db
      .insert(directMessagesTable)
      .values({
        conversationId: convId,
        senderId: peer.id,
        recipientId: caller.id,
        content: "TOP SECRET — should be swept",
        expiresAt: past,
      })
      .returning({ id: directMessagesTable.id });

    const [freshRow] = await db
      .insert(directMessagesTable)
      .values({
        conversationId: convId,
        senderId: peer.id,
        recipientId: caller.id,
        content: "still alive",
        expiresAt: future,
      })
      .returning({ id: directMessagesTable.id });

    const [foreverRow] = await db
      .insert(directMessagesTable)
      .values({
        conversationId: convId,
        senderId: peer.id,
        recipientId: caller.id,
        content: "no expiry",
        expiresAt: null,
      })
      .returning({ id: directMessagesTable.id });

    const result = await runExpiredDirectMessagesCleanup();
    expect(result.deletedCount).toBeGreaterThanOrEqual(1);

    const survivors = await db
      .select({ id: directMessagesTable.id })
      .from(directMessagesTable)
      .where(
        and(
          eq(directMessagesTable.conversationId, convId),
          inArray(directMessagesTable.id, [
            expiredRow.id,
            freshRow.id,
            foreverRow.id,
          ]),
        ),
      );
    const survivorIds = new Set(survivors.map((r) => r.id));
    expect(survivorIds.has(expiredRow.id)).toBe(false);
    expect(survivorIds.has(freshRow.id)).toBe(true);
    expect(survivorIds.has(foreverRow.id)).toBe(true);
  });

  it("is a safe no-op when nothing is expired", async () => {
    const { caller, peer, convId } = await makeConversation();
    const future = new Date(Date.now() + 60 * 60_000);

    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "fresh",
      expiresAt: future,
    });

    // Snapshot the conversation's lastMessageAt so we can prove the sweep
    // did NOT touch it when there was nothing to delete.
    const [before] = await db
      .select({ lastMessageAt: directConversationsTable.lastMessageAt })
      .from(directConversationsTable)
      .where(eq(directConversationsTable.id, convId));

    const result = await runExpiredDirectMessagesCleanup();
    // deletedCount is global across the test DB, so we only assert that
    // THIS conversation's surviving message is still there and that the
    // affected-conversation update path didn't fire for it.
    const rows = await db
      .select({ id: directMessagesTable.id })
      .from(directMessagesTable)
      .where(eq(directMessagesTable.conversationId, convId));
    expect(rows.length).toBe(1);

    const [after] = await db
      .select({ lastMessageAt: directConversationsTable.lastMessageAt })
      .from(directConversationsTable)
      .where(eq(directConversationsTable.id, convId));
    expect(after.lastMessageAt.getTime()).toBe(before.lastMessageAt.getTime());

    // Sanity on the return shape.
    expect(typeof result.deletedCount).toBe("number");
    expect(typeof result.conversationsUpdated).toBe("number");
  });

  it("recomputes lastMessageAt for a conversation whose newest surviving message changed", async () => {
    const { caller, peer, convId } = await makeConversation();

    const olderFresh = new Date(Date.now() - 10 * 60_000); // 10 min ago
    const newerExpired = new Date(Date.now() - 60_000); // 1 min ago createdAt
    const past = new Date(Date.now() - 30_000);

    // Older fresh message.
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "older fresh",
      createdAt: olderFresh,
      expiresAt: null,
    });
    // Newer message that's already expired — drives lastMessageAt up via
    // the `sendDirectMessage` path normally, but here we simulate the
    // post-expiry steady state by stamping the conversation row directly.
    await db.insert(directMessagesTable).values({
      conversationId: convId,
      senderId: peer.id,
      recipientId: caller.id,
      content: "newer expired",
      createdAt: newerExpired,
      expiresAt: past,
    });
    await db
      .update(directConversationsTable)
      .set({ lastMessageAt: newerExpired })
      .where(eq(directConversationsTable.id, convId));

    await runExpiredDirectMessagesCleanup();

    const [conv] = await db
      .select({ lastMessageAt: directConversationsTable.lastMessageAt })
      .from(directConversationsTable)
      .where(eq(directConversationsTable.id, convId));
    // After the sweep, lastMessageAt should fall back to the older fresh
    // message's createdAt (the only surviving message in the conversation).
    expect(conv.lastMessageAt.getTime()).toBe(olderFresh.getTime());
  });
});
