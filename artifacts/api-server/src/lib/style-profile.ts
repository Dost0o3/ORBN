import { db, postsTable, userStyleProfilesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

// Soul Twin convention: try the search-preview variant first, fall back to
// gpt-4o-mini if it errors. Search-preview may reject `response_format`,
// in which case the fallback path runs with the same params.
const MODEL_PRIMARY = "gpt-4o-mini-search-preview";
const MODEL_FALLBACK = "gpt-4o-mini";
const POSTS_TO_ANALYZE = 50;

async function chatWithFallback(
  primary: string,
  params: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    max_completion_tokens?: number;
    response_format?: { type: "json_object" } | { type: "text" };
  },
) {
  try {
    return await openai.chat.completions.create({ ...params, model: primary, stream: false });
  } catch (err) {
    logger.warn({ err, primary }, "style-profile: search-preview failed, falling back to gpt-4o-mini");
    return openai.chat.completions.create({ ...params, model: MODEL_FALLBACK, stream: false });
  }
}

export interface StyleProfile {
  userId: string;
  tone: string | null;
  cadence: string | null;
  emojis: string[];
  openers: string[];
  closers: string[];
  topics: string[];
  doNots: string[];
  sample: string | null;
  postsAnalyzed: number;
  refreshedAt: Date;
}

export async function getStyleProfile(userId: string): Promise<StyleProfile | null> {
  const row = await db.query.userStyleProfilesTable.findFirst({ where: eq(userStyleProfilesTable.userId, userId) });
  if (!row) return null;
  return {
    userId: row.userId,
    tone: row.tone,
    cadence: row.cadence,
    emojis: row.emojis ?? [],
    openers: row.openers ?? [],
    closers: row.closers ?? [],
    topics: row.topics ?? [],
    doNots: row.doNots ?? [],
    sample: row.sample,
    postsAnalyzed: row.postsAnalyzed,
    refreshedAt: row.refreshedAt,
  };
}

interface ParsedStyle {
  tone: string;
  cadence: string;
  emojis: string[];
  openers: string[];
  closers: string[];
  topics: string[];
  do_nots: string[];
}

export async function refreshStyleProfile(userId: string): Promise<StyleProfile> {
  const posts = await db
    .select({ content: postsTable.content })
    .from(postsTable)
    .where(eq(postsTable.authorId, userId))
    .orderBy(desc(postsTable.createdAt))
    .limit(POSTS_TO_ANALYZE);

  const sample = posts.map((p, i) => `${i + 1}. ${p.content}`).join("\n").slice(0, 4000);

  let parsed: ParsedStyle = {
    tone: "neutral, professional",
    cadence: "short paragraphs",
    emojis: [],
    openers: [],
    closers: [],
    topics: [],
    do_nots: [],
  };

  if (posts.length > 0) {
    try {
      const completion = await chatWithFallback(MODEL_PRIMARY, {
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a writing-style analyst. Given a user's recent posts, extract their voice as JSON with keys: tone (1 short sentence), cadence (1 short sentence), emojis (array of strings, can be empty), openers (array of 3 short opening phrases they actually use), closers (array of 3 short closing phrases), topics (array of 5 most-discussed topics), do_nots (array of 3 phrases or behaviours they would never use). Output JSON only.",
          },
          { role: "user", content: `Analyse these ${posts.length} posts and return the style JSON:\n\n${sample}` },
        ],
      });
      const text = completion.choices[0]?.message?.content ?? "{}";
      const obj = JSON.parse(text) as Partial<ParsedStyle>;
      parsed = {
        tone: typeof obj.tone === "string" ? obj.tone : parsed.tone,
        cadence: typeof obj.cadence === "string" ? obj.cadence : parsed.cadence,
        emojis: Array.isArray(obj.emojis) ? obj.emojis.map(String).slice(0, 12) : [],
        openers: Array.isArray(obj.openers) ? obj.openers.map(String).slice(0, 5) : [],
        closers: Array.isArray(obj.closers) ? obj.closers.map(String).slice(0, 5) : [],
        topics: Array.isArray(obj.topics) ? obj.topics.map(String).slice(0, 8) : [],
        do_nots: Array.isArray(obj.do_nots) ? obj.do_nots.map(String).slice(0, 5) : [],
      };
    } catch (err) {
      logger.warn({ err, userId }, "style-profile: refresh failed, using defaults");
    }
  }

  const sampleSnippet = sample.slice(0, 800);
  await db
    .insert(userStyleProfilesTable)
    .values({
      userId,
      tone: parsed.tone,
      cadence: parsed.cadence,
      emojis: parsed.emojis,
      openers: parsed.openers,
      closers: parsed.closers,
      topics: parsed.topics,
      doNots: parsed.do_nots,
      sample: sampleSnippet,
      postsAnalyzed: posts.length,
      refreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userStyleProfilesTable.userId,
      set: {
        tone: parsed.tone,
        cadence: parsed.cadence,
        emojis: parsed.emojis,
        openers: parsed.openers,
        closers: parsed.closers,
        topics: parsed.topics,
        doNots: parsed.do_nots,
        sample: sampleSnippet,
        postsAnalyzed: posts.length,
        refreshedAt: new Date(),
      },
    });

  const fetched = await getStyleProfile(userId);
  if (!fetched) throw new Error("style-profile: failed to persist");
  return fetched;
}

export function styleSummary(profile: StyleProfile | null): string {
  if (!profile) return "Tone: confident, modern professional. No prior writing samples available.";
  const parts: string[] = [];
  if (profile.tone) parts.push(`Tone: ${profile.tone}`);
  if (profile.cadence) parts.push(`Cadence: ${profile.cadence}`);
  if (profile.openers.length) parts.push(`Often opens with: ${profile.openers.join(" / ")}`);
  if (profile.closers.length) parts.push(`Often closes with: ${profile.closers.join(" / ")}`);
  if (profile.emojis.length) parts.push(`Emojis they use: ${profile.emojis.join(" ")}`);
  if (profile.topics.length) parts.push(`Common topics: ${profile.topics.join(", ")}`);
  if (profile.doNots.length) parts.push(`Never: ${profile.doNots.join(" / ")}`);
  return parts.join("\n");
}
