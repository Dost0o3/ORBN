import { Router } from "express";
import { db } from "@workspace/db";
import {
  directBlocksTable,
  directConversationsTable,
  directMessagesTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, isNull, notInArray, or, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  SendDirectMessageBody,
  GetDirectConversationMessagesParams,
  GetDirectConversationMessagesQueryParams,
} from "@workspace/api-zod";
import { ensureUser, buildUserProfile } from "./users";
import {
  DirectMessageBlockedError,
  sendDirectMessage,
} from "../lib/dm-helpers";
import { publish, subscribe } from "../lib/sse-bus";

const router = Router();

// Direct-message rows are filtered to exclude expired self-destructing entries.
const notExpiredFilter = or(
  isNull(directMessagesTable.expiresAt),
  gt(directMessagesTable.expiresAt, sql`now()`),
);

router.post("/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = SendDirectMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { recipientId, content, ttlSeconds } = parsed.data;
  const trimmed = content.trim();
  if (!trimmed) {
    res.status(400).json({ error: "Content required" });
    return;
  }

  const me = await ensureUser(clerkId);
  if (recipientId === me.id) {
    res.status(400).json({ error: "Cannot DM yourself" });
    return;
  }

  const recipient = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, recipientId),
  });
  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  // Block enforcement lives inside `sendDirectMessage` so every DM creation
  // path (this route, Soul Twin agent actions, future automations) goes
  // through the same guard. We return 403 either way so the sender can't
  // tell whether the recipient blocked them.
  try {
    const msg = await sendDirectMessage({
      senderId: me.id,
      recipientId: recipient.id,
      content: trimmed,
      ttlSeconds: ttlSeconds ?? null,
    });
    res.status(201).json(msg);
  } catch (err) {
    if (err instanceof DirectMessageBlockedError) {
      res.status(403).json({ error: "Cannot send message" });
      return;
    }
    throw err;
  }
});

router.get("/conversations", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);

  // Pull both directions of blocks so we can hide any conversation involving a
  // user the viewer blocked OR a user who blocked the viewer.
  const blockRows = await db
    .select({
      blockerId: directBlocksTable.blockerId,
      blockedId: directBlocksTable.blockedId,
    })
    .from(directBlocksTable)
    .where(
      or(
        eq(directBlocksTable.blockerId, me.id),
        eq(directBlocksTable.blockedId, me.id),
      ),
    );
  const hiddenPeerIds = new Set<string>();
  for (const b of blockRows) {
    hiddenPeerIds.add(b.blockerId === me.id ? b.blockedId : b.blockerId);
  }

  const convs = await db
    .select()
    .from(directConversationsTable)
    .where(
      or(
        eq(directConversationsTable.user1Id, me.id),
        eq(directConversationsTable.user2Id, me.id),
      ),
    )
    .orderBy(desc(directConversationsTable.lastMessageAt));

  const summaries = await Promise.all(
    convs.map(async (c) => {
      const peerId = c.user1Id === me.id ? c.user2Id : c.user1Id;
      if (hiddenPeerIds.has(peerId)) return null;
      const peerRow = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, peerId),
      });
      const peer = peerRow ? await buildUserProfile(peerRow, clerkId) : null;

      const [lastMessageRaw] = await db
        .select()
        .from(directMessagesTable)
        .where(
          and(eq(directMessagesTable.conversationId, c.id), notExpiredFilter),
        )
        .orderBy(desc(directMessagesTable.createdAt))
        .limit(1);
      // Same receipts-visibility rule as GET /conversations/:id/messages
      // (task #68): scrub readAt unless BOTH me and the peer have read
      // receipts enabled. Without this scrub the conversation list's
      // Sent/Read indicator would leak around the privacy toggle.
      const receiptsVisible =
        me.readReceiptsEnabled && (peerRow?.readReceiptsEnabled ?? true);
      const lastMessage =
        lastMessageRaw && !receiptsVisible
          ? { ...lastMessageRaw, readAt: null }
          : (lastMessageRaw ?? null);

      const [unreadRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(directMessagesTable)
        .where(
          and(
            eq(directMessagesTable.conversationId, c.id),
            eq(directMessagesTable.recipientId, me.id),
            isNull(directMessagesTable.readAt),
            notExpiredFilter,
          ),
        );

      return {
        id: c.id,
        peer,
        lastMessage: lastMessage ?? null,
        unreadCount: Number(unreadRow?.count ?? 0),
        lastMessageAt: c.lastMessageAt,
      };
    }),
  );

  // Drop conversations hidden by a block, or whose peer was deleted —
  // the orphaned rows would break the UI.
  res.json({
    conversations: summaries.filter(
      (s): s is NonNullable<typeof s> => s !== null && s.peer !== null,
    ),
  });
});

router.get(
  "/conversations/:conversationId/messages",
  async (req, res): Promise<void> => {
    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = GetDirectConversationMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error });
      return;
    }
    const query = GetDirectConversationMessagesQueryParams.safeParse(req.query);
    const limit = query.success ? (query.data.limit ?? 50) : 50;

    const me = await ensureUser(clerkId);
    const convId = Number(params.data.conversationId);
    const conv = await db.query.directConversationsTable.findFirst({
      where: eq(directConversationsTable.id, convId),
    });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conv.user1Id !== me.id && conv.user2Id !== me.id) {
      res.status(403).json({ error: "Not a participant" });
      return;
    }

    const peerId = conv.user1Id === me.id ? conv.user2Id : conv.user1Id;
    const peerRow = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, peerId),
    });
    if (!peerRow) {
      res.status(404).json({ error: "Peer not found" });
      return;
    }
    const peer = await buildUserProfile(peerRow, clerkId);

    // Fetch the most recent N messages, then return them oldest-first for chat display.
    // Expired self-destructing messages are intentionally INCLUDED here (until the
    // periodic cleanup sweep deletes them) so the client can render a subtle
    // "this message has self-destructed" placeholder in their original position
    // — disappearing them outright is confusing.
    const recent = await db
      .select()
      .from(directMessagesTable)
      .where(eq(directMessagesTable.conversationId, convId))
      .orderBy(desc(directMessagesTable.createdAt))
      .limit(limit);

    const nowMs = Date.now();
    // Read-receipt visibility (task #68): a message's readAt is visible to
    // the viewer only when BOTH parties have receipts enabled. If the
    // viewer disabled their own receipts, they get the same blindness in
    // return (symmetric); if the peer disabled theirs, we don't leak it
    // either. Applies uniformly to messages I sent and messages I received
    // — for received messages there's no behavioural difference, but
    // returning a non-null readAt would still leak the peer's reading
    // pattern to me indirectly.
    const receiptsVisible = me.readReceiptsEnabled && peerRow.readReceiptsEnabled;
    const messages = recent
      .slice()
      .reverse()
      .map((m) => {
        const expired =
          m.expiresAt !== null && m.expiresAt.getTime() <= nowMs;
        const scrubbed = receiptsVisible ? m : { ...m, readAt: null };
        if (!expired) return { ...scrubbed, expired: false };
        // Scrub `content` so an expired message body never reaches the client,
        // even if a buggy UI ignores the `expired` flag.
        return { ...scrubbed, content: "", expired: true };
      });

    // Mark all messages addressed to me in this conversation as read.
    // We always write readAt (so MY unread badge clears, even when I have
    // receipts disabled) but only publish the `read` SSE event when *I*
    // have receipts enabled — otherwise we'd be defeating the privacy
    // toggle by telling the sender in real time that I just opened the
    // thread. The peer's preference doesn't matter here; this branch is
    // about whether I broadcast my own read state.
    const readAt = new Date();
    const justRead = await db
      .update(directMessagesTable)
      .set({ readAt })
      .where(
        and(
          eq(directMessagesTable.conversationId, convId),
          eq(directMessagesTable.recipientId, me.id),
          isNull(directMessagesTable.readAt),
        ),
      )
      .returning({
        id: directMessagesTable.id,
        senderId: directMessagesTable.senderId,
      });

    // Symmetric SSE gating (task #68): publish the `read` event only when
    // BOTH parties have receipts enabled. Skip if I (the reader) hid mine
    // — otherwise I'd be telling the sender in real time anyway. Skip if
    // the notified sender hid theirs — they opted out of seeing other
    // people's read state, and the SSE channel is the live equivalent of
    // exposing readAt over REST. In a 1:1 thread there's exactly one
    // peer, but we still resolve per-sender to keep the loop honest if
    // the schema ever grows to multi-party.
    if (justRead.length > 0 && me.readReceiptsEnabled) {
      const sendersToNotify = new Set(justRead.map((m) => m.senderId));
      for (const senderId of sendersToNotify) {
        // Fast path: in 1:1 threads the only sender is the peer we
        // already loaded above, so reuse peerRow instead of re-querying.
        const senderRow =
          senderId === peerRow.id
            ? peerRow
            : await db.query.usersTable.findFirst({
                where: eq(usersTable.id, senderId),
              });
        if (!senderRow?.readReceiptsEnabled) continue;
        publish("dm-inbox", senderId, {
          type: "read",
          conversationId: convId,
          readerId: me.id,
          messageIds: justRead
            .filter((m) => m.senderId === senderId)
            .map((m) => m.id),
          at: readAt.toISOString(),
        });
      }
    }

    res.json({ messages, peer });
  },
);

// Sender pings this while composing — we forward a typing event to the
// recipient's open SSE stream. No DB writes; intentionally cheap.
router.post("/messages/typing", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const recipientId =
    typeof req.body?.recipientId === "string" ? req.body.recipientId : null;
  if (!recipientId) {
    res.status(400).json({ error: "recipientId required" });
    return;
  }
  const me = await ensureUser(clerkId);
  if (recipientId === me.id) {
    res.status(400).json({ error: "Cannot type to yourself" });
    return;
  }
  // Match the existence check in POST /messages so typing pings can't be used
  // to probe arbitrary user ids.
  const recipient = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, recipientId),
  });
  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }
  // Refresh presence opportunistically so the act of typing also keeps the
  // sender visible as online to anyone watching.
  await db
    .update(usersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(usersTable.id, me.id));
  publish("dm-inbox", recipientId, {
    type: "typing",
    fromUserId: me.id,
    at: new Date().toISOString(),
  });
  res.json({ ok: true });
});

// Long-lived SSE stream for the current user that receives both new direct
// messages and typing events from peers. Replaces the 5-second poll loop.
router.get("/messages/stream", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({ type: "ready", at: new Date().toISOString() })}\n\n`,
  );

  const unsub = subscribe("dm-inbox", me.id, res);
  const ka = setInterval(() => {
    try {
      res.write(": ka\n\n");
    } catch {
      /* ignore */
    }
  }, 25_000);

  const close = () => {
    clearInterval(ka);
    unsub();
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  req.on("close", close);
  req.on("aborted", close);
});

router.get("/messages/unread-count", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.json({ count: 0 });
    return;
  }
  const me = await ensureUser(clerkId);
  const blockRows = await db
    .select({
      blockerId: directBlocksTable.blockerId,
      blockedId: directBlocksTable.blockedId,
    })
    .from(directBlocksTable)
    .where(
      or(
        eq(directBlocksTable.blockerId, me.id),
        eq(directBlocksTable.blockedId, me.id),
      ),
    );
  const hiddenSenderIds = Array.from(
    new Set(
      blockRows.map((b) => (b.blockerId === me.id ? b.blockedId : b.blockerId)),
    ),
  );
  const conditions = [
    eq(directMessagesTable.recipientId, me.id),
    isNull(directMessagesTable.readAt),
    notExpiredFilter,
  ];
  if (hiddenSenderIds.length > 0) {
    conditions.push(notInArray(directMessagesTable.senderId, hiddenSenderIds));
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(directMessagesTable)
    .where(and(...conditions));
  res.json({ count: Number(row?.count ?? 0) });
});

export default router;
