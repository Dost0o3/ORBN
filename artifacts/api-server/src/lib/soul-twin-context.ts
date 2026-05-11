import { db, postsTable, usersTable, followsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
// Minimal local type — mirrors the shape of OpenAI's ChatCompletionMessageParam
// so we don't take a hard dep on the openai package's deep import path.
type ChatCompletionMessageParam =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null }
  | { role: "tool"; content: string; tool_call_id: string };
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

const PRIMARY_MODEL = "gpt-4o-mini-search-preview";
const FALLBACK_MODEL = "gpt-4o-mini";
const RECENT_POST_LIMIT = 5;

export interface SoulTwinContext {
  systemPrompt: string;
  hasWebAccess: boolean;
}

function safeSlice(text: string | null | undefined, max = 240): string {
  if (!text) return "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? trimmed.slice(0, max - 1) + "…" : trimmed;
}

function fmtDate(d: Date): string {
  return d.toUTCString();
}

export async function buildSoulTwinSystemPrompt(userInternalId: string): Promise<string> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userInternalId),
  });

  if (!user) {
    return defaultPrompt("a NexusID member");
  }

  const [recentPosts, followerCount, followingCount] = await Promise.all([
    db
      .select({ content: postsTable.content, createdAt: postsTable.createdAt, mood: postsTable.mood, hashtags: postsTable.hashtags })
      .from(postsTable)
      .where(eq(postsTable.authorId, user.id))
      .orderBy(desc(postsTable.createdAt))
      .limit(RECENT_POST_LIMIT),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(followsTable)
      .where(eq(followsTable.followingId, user.id))
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(followsTable)
      .where(eq(followsTable.followerId, user.id))
      .then((r) => r[0]?.count ?? 0),
  ]);

  const skills = (user.skills ?? []).slice(0, 12).join(", ");
  const recentVoice = recentPosts
    .map((p, i) => `  ${i + 1}. (${p.mood ?? "post"}) "${safeSlice(p.content, 220)}"`)
    .join("\n");

  const profileLines = [
    `- Name: ${user.displayName}`,
    user.occupation ? `- Occupation: ${user.occupation}` : null,
    user.location ? `- Location: ${user.location}` : null,
    user.website ? `- Website: ${user.website}` : null,
    skills ? `- Skills: ${skills}` : null,
    user.bio ? `- Bio: ${safeSlice(user.bio, 320)}` : null,
    `- Audience: ${followerCount} followers, ${followingCount} following`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are the AI Soul Twin of ${user.displayName} on NexusID — a sharp, confident, visionary version of them at their absolute best.

CURRENT DATE/TIME: ${fmtDate(new Date())}

═══ CRITICAL RULES — VIOLATING THESE IS FAILURE ═══

1. NEVER announce that you are about to search. NEVER write phrases like:
   - "Let me search…", "I'll look it up", "One moment", "Hold on", "Wait a sec"
   - "Mujhe search karna padhega", "Thodi der rukhein", "Ek minute"
   - "main abhi search karta hoon", "main aapko bata raha hoon"
   Just SILENTLY search and respond with the FINAL ANSWER in the same reply.

2. For ANY question about current events, news, prices, recent launches, what's
   happening "today/now/this week", trending topics, people, companies, crypto,
   web3, sports, politics — you MUST search the web before answering and include
   2–4 specific facts with markdown source links like [source](https://…).

3. MATCH THE USER'S LANGUAGE EXACTLY. If they write Hinglish (Hindi + English
   mixed in Roman script), reply in Hinglish. If they write Hindi, reply in
   Hindi. If English, reply in English. Never switch languages on them.

4. Be DIRECT and PUNCHY. No filler, no hedging, no "great question!". Lead
   with the answer in the first sentence. Use short paragraphs and bullets.

═══ THE PERSON YOU EMBODY (their up-to-date profile) ═══
${profileLines}

═══ THEIR RECENT VOICE (last ${recentPosts.length} posts, newest first) — match this tone ═══
${recentVoice || "  (no posts yet — speak in a confident, ambitious, modern professional voice)"}

═══ HOW TO RESPOND ═══
- Talk in first person ("I think…", "My take…") as if you ARE them at their best.
- For factual / current questions → search NOW, deliver the answer with sources.
- For strategic / personal questions → use the profile + voice above; don't search.
- Format with short paragraphs and bullets. Use markdown.
- Keep responses under ~250 words unless asked for depth.`;
}

function defaultPrompt(name: string): string {
  return `You are the AI Soul Twin of ${name} on NexusID. You have live web access. Today is ${fmtDate(new Date())}. Match the user's language. Never announce that you're about to search — just search and reply with the answer + sources. No filler like "wait a moment" or "thodi der rukhein".`;
}

export async function streamSoulTwinReply(opts: {
  systemPrompt: string;
  history: ChatCompletionMessageParam[];
  onChunk: (text: string) => void;
}): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.history,
  ];

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      max_tokens: 1024,
      messages,
      stream: true,
      web_search_options: { search_context_size: "medium" },
    } as Parameters<typeof openai.chat.completions.create>[0]);

    for await (const chunk of stream as AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        opts.onChunk(content);
      }
    }
    if (fullResponse.trim().length === 0) {
      throw new Error("search-preview returned empty response");
    }
    return fullResponse;
  } catch (err) {
    logger.warn({ err }, "soul-twin: search-preview failed, falling back to gpt-4o-mini");
    fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: FALLBACK_MODEL,
      max_completion_tokens: 1024,
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        opts.onChunk(content);
      }
    }
    return fullResponse;
  }
}
