import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, postsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  GetCareerOracleBody,
  EnhancePostBody,
  DetectMoodBody,
  ChatWithSoulTwinBody,
} from "@workspace/api-zod";
import { ensureUser } from "./users";
import { buildSoulTwinSystemPrompt, streamSoulTwinReply } from "../lib/soul-twin-context";

const AISuggestionSchema = z.object({
  id: z.string().optional(),
  topic: z.string().min(1).max(120),
  hook: z.string().min(1).max(600),
  reasoning: z.string().min(1).max(600),
  signals: z.array(z.string().min(1).max(120)).max(6).default([]),
  predictedEngagement: z.string().min(1).max(120),
});
const AISuggestionsResponseSchema = z.object({
  suggestions: z.array(AISuggestionSchema).min(1).max(3),
});

const router = Router();

router.post("/ai/soul-twin/chat", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ChatWithSoulTwinBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const user = await ensureUser(clerkId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const flush = () => {
    (res as unknown as { flush?: () => void }).flush?.();
  };

  try {
    const systemPrompt = await buildSoulTwinSystemPrompt(user.id);
    res.write(`data: ${JSON.stringify({ status: "searching" })}\n\n`);
    flush();
    await streamSoulTwinReply({
      systemPrompt,
      history: [{ role: "user", content: parsed.data.message }],
      onChunk: (content) => {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        flush();
      },
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    flush();
    res.end();
  } catch (err) {
    req.log.error({ err }, "soul-twin direct chat failed");
    res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
    res.end();
  }
});

router.post("/ai/career-oracle", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = GetCareerOracleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const { skills, targetRole, experience } = parsed.data;

  const prompt = `You are an elite career strategist with deep knowledge of tech industry trends. 
  
User skills: ${skills.join(", ")}
Target role: ${targetRole}
Experience: ${JSON.stringify(experience)}

Provide a detailed career roadmap as JSON with this exact structure:
{
  "roadmap": [{"step": 1, "title": "...", "description": "...", "timeframe": "...", "skills": ["..."]}],
  "skillGaps": [{"skill": "...", "priority": "high|medium|low", "resources": ["..."]}],
  "jobSuggestions": ["..."],
  "marketTrends": ["..."]
}

Be specific, actionable, and realistic. Focus on the next 12-24 months.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    res.json({
      roadmap: result.roadmap ?? [],
      skillGaps: result.skillGaps ?? [],
      jobSuggestions: result.jobSuggestions ?? [],
      marketTrends: result.marketTrends ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: "AI service error" });
  }
});

router.post("/ai/enhance-post", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = EnhancePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const { content, tone } = parsed.data;

  const prompt = `You are a professional social media writer. Enhance this post for NexusID (a professional network). 
Tone: ${tone ?? "professional"}
Original: "${content}"

Return JSON: {"enhancedContent": "...", "hashtags": ["...", "..."], "suggestions": ["...", "..."]}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const result = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    res.json({
      enhancedContent: result.enhancedContent ?? content,
      hashtags: result.hashtags ?? [],
      suggestions: result.suggestions ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: "AI service error" });
  }
});

router.post("/ai/mood-detect", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const parsed = DetectMoodBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }

  const { text } = parsed.data;
  const prompt = `Classify the mood of this text into one of: motivational, professional, collaborative, creative. Return JSON: {"mood": "...", "confidence": 0.0-1.0}. Text: "${text}"`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 50,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const result = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    res.json({ mood: result.mood ?? "professional", confidence: result.confidence ?? 0.8 });
  } catch {
    res.json({ mood: "professional", confidence: 0.8 });
  }
});

router.post("/ai/suggest-topics", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const user = await ensureUser(clerkId);
    const recent = await db
      .select({ content: postsTable.content })
      .from(postsTable)
      .where(eq(postsTable.authorId, user.id))
      .orderBy(desc(postsTable.createdAt))
      .limit(10);

    const recentExcerpts = recent
      .map((p, i) => `${i + 1}. ${p.content.slice(0, 200)}`)
      .join("\n") || "(no recent posts yet)";

    const profileBlurb = [
      user.occupation ? `Occupation: ${user.occupation}` : null,
      user.bio ? `Bio: ${user.bio.slice(0, 200)}` : null,
      user.skills?.length ? `Skills: ${user.skills.slice(0, 8).join(", ")}` : null,
    ].filter(Boolean).join("\n") || "(profile is sparse)";

    const seed = Math.floor(Math.random() * 1_000_000);
    const prompt = `You are a viral social-media strategist for ORBN (a professional network).
Generate 3 FRESH post topic suggestions tailored to this user. Vary the angles each time —
do NOT repeat ideas. Use seed ${seed} to ensure novelty.

USER PROFILE:
${profileBlurb}

USER'S RECENT POSTS:
${recentExcerpts}

Return JSON with this exact structure:
{
  "suggestions": [
    {
      "id": "s1",
      "topic": "Short uppercase headline (max 7 words)",
      "hook": "1-2 sentence opening that would make a professional stop scrolling",
      "reasoning": "Why this would work for THIS user, referencing their actual profile/posts",
      "signals": ["3 short bullet phrases of evidence"],
      "predictedEngagement": "High|Very high|Medium-high · short metric phrase"
    }
  ]
}
Make all 3 suggestions concrete, specific to the user, and clearly different from each other.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 900,
      temperature: 1.0,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw: unknown = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    const parsed = AISuggestionsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, "ai suggest-topics: malformed model output");
      res.status(502).json({ error: "AI returned an unusable response. Please try again." });
      return;
    }
    const suggestions = parsed.data.suggestions.slice(0, 3).map((s, i) => ({
      id: s.id ?? `s${i + 1}`,
      topic: s.topic,
      hook: s.hook,
      reasoning: s.reasoning,
      signals: s.signals,
      predictedEngagement: s.predictedEngagement,
    }));
    res.json({ suggestions });
  } catch (err) {
    req.log.error({ err }, "ai suggest-topics failed");
    res.status(500).json({ error: "AI service error" });
  }
});

export default router;
