import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  CreateConversationBody,
  GetConversationMessagesParams,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";
import { ensureUser } from "./users";
import { buildSoulTwinSystemPrompt, streamSoulTwinReply } from "../lib/soul-twin-context";

const router = Router();

router.get("/openai/conversations", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const convs = await db.select().from(conversations).where(eq(conversations.userId, user.id)).orderBy(desc(conversations.createdAt));
  res.json({ conversations: convs });
});

router.post("/openai/conversations", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const [conv] = await db.insert(conversations).values({ userId: user.id, title: parsed.data.title }).returning();
  res.status(201).json(conv);
});

async function assertConvOwner(convId: number, userInternalId: string): Promise<boolean> {
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, convId) });
  return !!conv && conv.userId === userInternalId;
}

router.get("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { id } = GetConversationMessagesParams.parse(req.params);
  const user = await ensureUser(clerkId);
  if (!(await assertConvOwner(Number(id), user.id))) { res.status(404).json({ error: "Not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, Number(id))).orderBy(messages.createdAt);
  res.json({ messages: msgs });
});

router.post("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { id } = GetConversationMessagesParams.parse(req.params);
  const parsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const user = await ensureUser(clerkId);
  if (!(await assertConvOwner(Number(id), user.id))) { res.status(404).json({ error: "Not found" }); return; }

  const userMsg = await db.insert(messages).values({ conversationId: Number(id), role: "user", content: parsed.data.content }).returning();

  const history = await db.select().from(messages).where(eq(messages.conversationId, Number(id))).orderBy(messages.createdAt);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const flush = () => {
    (res as unknown as { flush?: () => void }).flush?.();
  };

  try {
    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    const systemPrompt = await buildSoulTwinSystemPrompt(user.id);

    res.write(`data: ${JSON.stringify({ status: "searching" })}\n\n`);
    flush();

    const fullResponse = await streamSoulTwinReply({
      systemPrompt,
      history: chatMessages,
      onChunk: (content) => {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        flush();
      },
    });

    await db.insert(messages).values({ conversationId: Number(id), role: "assistant", content: fullResponse });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    flush();
    res.end();
  } catch (err) {
    req.log.error({ err }, "soul-twin stream failed");
    res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
    res.end();
  }
});

export default router;
