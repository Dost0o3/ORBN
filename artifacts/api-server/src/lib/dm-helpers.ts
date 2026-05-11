import {
  db,
  directBlocksTable,
  directConversationsTable,
  directMessagesTable,
} from "@workspace/db";
import { and, eq, gt, lte, or } from "drizzle-orm";
import { publish } from "./sse-bus";
import { logger } from "./logger";

// Track scheduled expiry timers so we don't double-schedule the same message
// (e.g. if a startup sweep races with a fresh send).
const scheduledExpiries = new Set<number>();
// Cap how far out we'll hold a setTimeout. setTimeout's max delay is ~24.8d;
// past that, we don't bother — the periodic cleanup sweep / next refetch will
// catch it long before the timer would have fired.
const MAX_EXPIRY_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Schedule an `expired` SSE broadcast to both participants the moment a
 * self-destructing DM passes its TTL, so open chat windows flip the bubble
 * to the placeholder without waiting for a refetch or local-clock tick.
 */
export function scheduleDmExpiryBroadcast(args: {
  messageId: number;
  conversationId: number;
  senderId: string;
  recipientId: string;
  expiresAt: Date;
}): void {
  if (scheduledExpiries.has(args.messageId)) return;
  const delayMs = args.expiresAt.getTime() - Date.now();
  if (delayMs > MAX_EXPIRY_DELAY_MS) return;
  scheduledExpiries.add(args.messageId);
  const fire = () => {
    scheduledExpiries.delete(args.messageId);
    const payload = {
      type: "expired" as const,
      conversationId: args.conversationId,
      messageId: args.messageId,
      at: new Date().toISOString(),
    };
    try {
      publish("dm-inbox", args.recipientId, payload);
      publish("dm-inbox", args.senderId, payload);
    } catch (err) {
      logger.warn({ err, messageId: args.messageId }, "dm expiry broadcast failed");
    }
  };
  if (delayMs <= 0) {
    fire();
    return;
  }
  const t = setTimeout(fire, delayMs);
  // Don't keep the event loop alive just for an expiry broadcast.
  t.unref?.();
}

export class DirectMessageBlockedError extends Error {
  constructor() {
    super("Cannot send message: blocked");
    this.name = "DirectMessageBlockedError";
  }
}

export async function isDmBlocked(
  userAId: string,
  userBId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: directBlocksTable.id })
    .from(directBlocksTable)
    .where(
      or(
        and(
          eq(directBlocksTable.blockerId, userAId),
          eq(directBlocksTable.blockedId, userBId),
        ),
        and(
          eq(directBlocksTable.blockerId, userBId),
          eq(directBlocksTable.blockedId, userAId),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Conversations are stored with `user1Id < user2Id` so each pair maps to a
// single row, regardless of who started the conversation.
export function pairIds(a: string, b: string): { user1Id: string; user2Id: string } {
  return a < b ? { user1Id: a, user2Id: b } : { user1Id: b, user2Id: a };
}

export async function findOrCreateConversation(
  meId: string,
  peerId: string,
): Promise<number> {
  const { user1Id, user2Id } = pairIds(meId, peerId);
  // Race-safe upsert: if two requests try to create the same pair concurrently,
  // ON CONFLICT DO NOTHING avoids a 500 from the unique-index violation; we then
  // SELECT the surviving row.
  const inserted = await db
    .insert(directConversationsTable)
    .values({ user1Id, user2Id })
    .onConflictDoNothing({
      target: [
        directConversationsTable.user1Id,
        directConversationsTable.user2Id,
      ],
    })
    .returning({ id: directConversationsTable.id });
  if (inserted.length > 0) return inserted[0].id;
  const existing = await db.query.directConversationsTable.findFirst({
    where: and(
      eq(directConversationsTable.user1Id, user1Id),
      eq(directConversationsTable.user2Id, user2Id),
    ),
  });
  if (!existing) {
    throw new Error("Failed to find or create conversation");
  }
  return existing.id;
}

export interface SendDmInput {
  senderId: string;
  recipientId: string;
  content: string;
  ttlSeconds?: number | null;
}

/**
 * Insert a direct message and bump the conversation's `lastMessageAt`. Shared
 * by the user-driven `/messages` route and the Soul Twin agent so the inbox
 * sees both in exactly the same way.
 */
export async function sendDirectMessage(input: SendDmInput) {
  const trimmed = input.content.trim();
  if (!trimmed) throw new Error("Content required");
  // Centralized block enforcement so every DM creation path (HTTP route,
  // Soul Twin agent actions, future automations) refuses sends when either
  // side has blocked the other.
  if (await isDmBlocked(input.senderId, input.recipientId)) {
    throw new DirectMessageBlockedError();
  }
  const conversationId = await findOrCreateConversation(input.senderId, input.recipientId);
  const expiresAt =
    typeof input.ttlSeconds === "number" && input.ttlSeconds > 0
      ? new Date(Date.now() + input.ttlSeconds * 1000)
      : null;
  const [msg] = await db
    .insert(directMessagesTable)
    .values({
      conversationId,
      senderId: input.senderId,
      recipientId: input.recipientId,
      content: trimmed,
      expiresAt,
    })
    .returning();
  await db
    .update(directConversationsTable)
    .set({ lastMessageAt: msg.createdAt })
    .where(eq(directConversationsTable.id, conversationId));
  // Push the new message to the recipient's open inbox stream and back to the
  // sender's other open tabs so all clients update without waiting for a poll.
  const payload = {
    type: "message" as const,
    message: {
      ...msg,
      createdAt:
        msg.createdAt instanceof Date
          ? msg.createdAt.toISOString()
          : msg.createdAt,
      expiresAt:
        msg.expiresAt instanceof Date
          ? msg.expiresAt.toISOString()
          : msg.expiresAt,
      readAt:
        msg.readAt instanceof Date ? msg.readAt.toISOString() : msg.readAt,
    },
  };
  publish("dm-inbox", input.recipientId, payload);
  publish("dm-inbox", input.senderId, payload);
  if (msg.expiresAt instanceof Date) {
    scheduleDmExpiryBroadcast({
      messageId: msg.id,
      conversationId: msg.conversationId,
      senderId: input.senderId,
      recipientId: input.recipientId,
      expiresAt: msg.expiresAt,
    });
  }
  return msg;
}

/**
 * On boot, scan for self-destructing DMs that haven't expired yet and arm
 * timers for each so a server restart doesn't cause peers with open chats to
 * miss the placeholder flip. Bounded by `MAX_EXPIRY_DELAY_MS` per message.
 */
export async function rehydrateDmExpiryTimers(): Promise<void> {
  const cutoff = new Date(Date.now() + MAX_EXPIRY_DELAY_MS);
  const rows = await db
    .select({
      id: directMessagesTable.id,
      conversationId: directMessagesTable.conversationId,
      senderId: directMessagesTable.senderId,
      recipientId: directMessagesTable.recipientId,
      expiresAt: directMessagesTable.expiresAt,
    })
    .from(directMessagesTable)
    .where(
      and(
        // Only future expiries within our scheduling horizon.
        gt(directMessagesTable.expiresAt, new Date()),
        lte(directMessagesTable.expiresAt, cutoff),
      ),
    );
  for (const r of rows) {
    if (!r.expiresAt) continue;
    scheduleDmExpiryBroadcast({
      messageId: r.id,
      conversationId: r.conversationId,
      senderId: r.senderId,
      recipientId: r.recipientId,
      expiresAt: r.expiresAt,
    });
  }
}
