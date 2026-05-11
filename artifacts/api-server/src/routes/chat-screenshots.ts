import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  directConversationsTable,
  usersTable,
  notificationsTable,
  chatScreenshotEventsTable,
  devicePushTokensTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { ensureUser } from "./users";
import { logger } from "../lib/logger";

const router = Router();

const screenshotRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many screenshot reports. Slow down." },
  // Per-user keying so abuse from one Clerk identity can't be hidden by
  // rotating IPs (mobile carriers shift IPs constantly), and a shared
  // office IP doesn't penalize honest users.
  keyGenerator: (req, res) => {
    const auth = getAuth(req);
    if (auth.userId) return auth.userId;
    // Fall back to IP via the official helper so IPv6 addresses are
    // bucketed correctly (express-rate-limit v8 ValidationError otherwise).
    return ipKeyGenerator(req.ip ?? "", 56);
  },
});

const ReportBody = z.object({
  conversationId: z.number().int().positive(),
  platform: z.enum(["ios", "android"]).optional(),
});

/**
 * Native push fanout — fire-and-forget. We never let a push failure
 * roll back the in-DB record: the in-app notification is the source
 * of truth for the recipient.
 */
async function pushPeer(
  peerId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const tokens = await db
      .select({ token: devicePushTokensTable.token })
      .from(devicePushTokensTable)
      .where(eq(devicePushTokensTable.userId, peerId));
    const expoTokens = tokens
      .map((t) => t.token)
      .filter((t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["));
    if (expoTokens.length === 0) return;
    const messages = expoTokens.map((to) => ({
      to,
      sound: "default" as const,
      title,
      body,
      data: { kind: "chat_screenshot" },
    }));
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, text }, "chat-screenshot: expo push rejected");
    }
  } catch (err) {
    logger.warn({ err, peerId }, "chat-screenshot: push failed");
  }
}

router.post("/chat/screenshot", screenshotRateLimiter, async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = ReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const me = await ensureUser(clerkId);

  // Look up the conversation and derive the peer SERVER-SIDE — the
  // client never gets to declare who was on the other side, so a
  // malicious app can't smear an unrelated user's profile counter.
  const conv = await db.query.directConversationsTable.findFirst({
    where: eq(directConversationsTable.id, parsed.data.conversationId),
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

  // One transaction: log event + bump public counter + write the
  // peer's notification row. If any step fails, none stick.
  let chatScreenshotsTaken = me.chatScreenshotsTaken ?? 0;
  await db.transaction(async (tx) => {
    await tx.insert(chatScreenshotEventsTable).values({
      conversationId: conv.id,
      screenshotterId: me.id,
      peerId,
      platform: parsed.data.platform ?? null,
    });
    const [updated] = await tx
      .update(usersTable)
      .set({ chatScreenshotsTaken: sql`${usersTable.chatScreenshotsTaken} + 1` })
      .where(eq(usersTable.id, me.id))
      .returning({ count: usersTable.chatScreenshotsTaken });
    chatScreenshotsTaken = updated?.count ?? chatScreenshotsTaken + 1;

    const actorName = me.displayName || me.username || "Someone";
    await tx.insert(notificationsTable).values({
      userId: peerId,
      type: "chat_screenshot",
      message: `${actorName} took a screenshot of your chat`,
      actorId: me.id,
      metadata: { conversationId: conv.id },
    });
  });

  // Out-of-band push (best-effort, post-commit).
  void pushPeer(peerId, "Screenshot taken", `${me.displayName || me.username || "Someone"} screenshotted your chat`);

  res.json({ ok: true, chatScreenshotsTaken });
});

export default router;
