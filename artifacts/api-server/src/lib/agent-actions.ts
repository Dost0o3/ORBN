import {
  db,
  postsTable,
  commentsTable,
  usersTable,
  followsTable,
  bountiesTable,
  directMessagesTable,
  notificationsTable,
  soulTwinOpportunitiesTable,
  soulTwinActionsTable,
  type SoulTwinAction,
} from "@workspace/db";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { getStyleProfile, refreshStyleProfile, styleSummary, type StyleProfile } from "./style-profile";
import { sendDirectMessage, DirectMessageBlockedError } from "./dm-helpers";
import { createPostForUser, createCommentForPost, PostHelperValidationError } from "./post-helpers";
import { checkAndIncrement } from "./rate-limit";
import { publish } from "./sse-bus";
import { deliverAutonomyHeadsUpDispatch, type OutboundEntry } from "./outbound-notify";

/**
 * Daily ceiling on actions the autonomy ("Set & Forget") path may execute on
 * behalf of a single user without a human-in-the-loop click. Once exhausted
 * the action is left in `pending` so the user can review it manually. This is
 * intentionally tight — autonomy mode amplifies blast radius if the model
 * misfires, so the cap has to be conservative.
 */
const AUTONOMY_DAILY_LIMIT = 10;

/**
 * Total execution attempts (initial + retries) before the background retry
 * sweep gives up on an approved-but-failed row and marks it `status="failed"`.
 * Tuned so a transient blip (DB hiccup, OpenAI 5xx, recipient temporarily
 * gone) gets re-tried for ~35 minutes before the row is shown as "Gave up".
 */
export const MAX_ATTEMPTS = 4;

/**
 * Wait time before the next retry attempt, indexed by current attemptCount
 * (so after attempt 1 fails we wait RETRY_BACKOFF_MS[0] before attempt 2,
 * after attempt 2 fails we wait RETRY_BACKOFF_MS[1] before attempt 3, etc.).
 * Length must equal MAX_ATTEMPTS - 1.
 */
export const RETRY_BACKOFF_MS: readonly number[] = [
  60_000,        // 1 minute  → 2nd attempt
  5 * 60_000,    // 5 minutes → 3rd attempt
  30 * 60_000,   // 30 minutes → 4th and final attempt
];

/**
 * Cap stored in soul_twin_actions.last_error so a runaway error message can't
 * blow up the row width. Pino already truncates server-side logs; this is
 * for the persisted column the client renders.
 */
const LAST_ERROR_MAX_LEN = 500;

function truncateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > LAST_ERROR_MAX_LEN ? msg.slice(0, LAST_ERROR_MAX_LEN - 1) + "…" : msg;
}

/**
 * Coarse-grained classification of an execution failure. Drives both the
 * Retry-button gating in the History UI (permanent codes hide Retry so
 * users can't burn attempts on something that will never succeed) and the
 * background retry sweep's decision to keep trying.
 */
export type AgentActionErrorCode =
  | "recipient_blocked"
  | "content_rejected"
  | "recipient_not_found"
  | "rate_limited"
  | "unknown_kind"
  | "internal";

/**
 * Error codes whose underlying cause can plausibly clear up on its own —
 * the background retry sweep keeps retrying these and the History UI
 * keeps the Retry button enabled. Anything outside this set is treated
 * as permanent: retrying will produce the same failure, so we hide Retry
 * and skip the row in the sweep.
 */
export const RETRYABLE_ERROR_CODES: ReadonlySet<AgentActionErrorCode> = new Set([
  "rate_limited",
  "internal",
]);

const ALL_AGENT_ACTION_ERROR_CODES: ReadonlySet<AgentActionErrorCode> = new Set([
  "recipient_blocked",
  "content_rejected",
  "recipient_not_found",
  "rate_limited",
  "unknown_kind",
  "internal",
]);

/**
 * Runtime type guard for the `lastErrorCode` column. Drizzle types it as a
 * plain `string | null` because the column is `text` (not a Postgres enum),
 * so any callsite that needs to branch on the union must validate first.
 * Unknown values (legacy rows, future codes the deployed binary doesn't
 * know about) are treated as NOT a known code — callers should default
 * such rows to retryable so we never accidentally lock a row out of the
 * sweep based on a value we can't interpret.
 */
export function isAgentActionErrorCode(value: unknown): value is AgentActionErrorCode {
  return typeof value === "string" && ALL_AGENT_ACTION_ERROR_CODES.has(value as AgentActionErrorCode);
}

export function classifyExecutionError(err: unknown): AgentActionErrorCode {
  if (err instanceof DirectMessageBlockedError) return "recipient_blocked";
  if (err instanceof UnknownAgentActionKindError) return "unknown_kind";
  if (err instanceof PostHelperValidationError) {
    return err.status === 404 ? "recipient_not_found" : "content_rejected";
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  // Heuristics for messages from helpers that don't have dedicated error
  // classes. Keep these narrow so a generic "internal" fallback covers
  // any unrecognised failure (and the retry sweep keeps trying it).
  if (lower.includes("recipient not found") || lower.includes("user not found") || lower.includes("missing postid")) {
    return "recipient_not_found";
  }
  // Note: we deliberately do NOT match the substring "blocked" here.
  // DirectMessageBlockedError (the canonical permanent-block case) is
  // already caught by the instanceof check above; a substring fallback
  // would falsely promote any generic error whose message happens to
  // contain "blocked" (e.g. "blocked by timeout") into the permanent
  // bucket, which would suppress retries that should have happened.
  if (lower.includes("rate") && lower.includes("limit")) return "rate_limited";
  if (lower.includes("moderation") || lower.includes("rejected") || lower.includes("forbidden content")) {
    return "content_rejected";
  }
  return "internal";
}

// Soul Twin convention: prefer the search-preview variant so the agent can
// reach live web context when drafting; fall back to plain gpt-4o-mini if the
// search-preview model is unavailable or rejects the request.
const DRAFT_MODEL_PRIMARY = "gpt-4o-mini-search-preview";
const SCAN_MODEL_PRIMARY = "gpt-4o-mini-search-preview";
const FALLBACK_MODEL = "gpt-4o-mini";

// Narrow to the non-streaming overload so `.choices` is well-typed.
type NonStreamChatParams = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  max_completion_tokens?: number;
  response_format?: { type: "json_object" } | { type: "text" };
};

async function chatWithFallback(primary: string, params: NonStreamChatParams) {
  try {
    return await openai.chat.completions.create({ ...params, model: primary, stream: false });
  } catch (err) {
    logger.warn({ err, primary }, "soul-twin: search-preview model failed, falling back to gpt-4o-mini");
    return openai.chat.completions.create({ ...params, model: FALLBACK_MODEL, stream: false });
  }
}

export interface AgentScanResult {
  connections: Array<{ userId: string; displayName: string; username: string; reason: string }>;
  opportunities: Array<{ id: number; kind: string; title: string; summary: string; cta: string | null; ctaUrl: string | null }>;
  suggestedPosts: Array<{ topic: string; draft: string }>;
}

async function ensureStyle(userId: string): Promise<StyleProfile> {
  const existing = await getStyleProfile(userId);
  if (existing) return existing;
  return refreshStyleProfile(userId);
}

export async function scanForOpportunities(userId: string): Promise<AgentScanResult> {
  const me = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!me) throw new Error("user not found");

  const [style, suggestedUsers, openBounties, recentPosts] = await Promise.all([
    ensureStyle(userId),
    db
      .select()
      .from(usersTable)
      .where(and(ne(usersTable.id, userId), sql`${usersTable.id} NOT IN (SELECT following_id FROM follows WHERE follower_id = ${userId})`))
      .orderBy(sql`random()`)
      .limit(5),
    db
      .select()
      .from(bountiesTable)
      .where(eq(bountiesTable.status, "open"))
      .orderBy(desc(bountiesTable.createdAt))
      .limit(5),
    db
      .select({ content: postsTable.content })
      .from(postsTable)
      .where(eq(postsTable.authorId, userId))
      .orderBy(desc(postsTable.createdAt))
      .limit(5),
  ]);

  const skills = (me.skills ?? []).join(", ");
  const myBio = me.bio ?? "";

  // Score connection candidates: skill overlap + recency.
  const connections = suggestedUsers.slice(0, 3).map((u) => {
    const candSkills = (u.skills ?? []).join(", ");
    const overlap = (u.skills ?? []).filter((s) => (me.skills ?? []).includes(s));
    const reason = overlap.length
      ? `Shared skills: ${overlap.slice(0, 3).join(", ")}`
      : `Active operator (${u.occupation ?? "builder"}) — worth a hello`;
    return { userId: u.id, displayName: u.displayName, username: u.username, reason };
  });

  // Score bounties as opportunities: skill overlap.
  const matchedBounties = openBounties
    .map((b) => {
      const text = `${b.title} ${b.description} ${b.category}`.toLowerCase();
      const hits = (me.skills ?? []).filter((s) => text.includes(s.toLowerCase()));
      return { b, score: hits.length };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);

  // Persist new opportunities idempotently: pre-check for an existing live
  // (kind=bounty, status=new) row that already references this bounty's id in
  // its payload before inserting. Without this, repeated /scan calls would
  // duplicate the same bounty card every time.
  const opportunityRecords: Array<{ id: number; kind: string; title: string; summary: string; cta: string | null; ctaUrl: string | null }> = [];
  for (const { b, score } of matchedBounties) {
    const title = `Bounty: ${b.title}`;
    const summary = score > 0
      ? `Matches ${score} of your skills — reward ${b.reward}.`
      : `Open bounty in ${b.category} — reward ${b.reward}.`;

    const existing = await db
      .select()
      .from(soulTwinOpportunitiesTable)
      .where(
        and(
          eq(soulTwinOpportunitiesTable.userId, userId),
          eq(soulTwinOpportunitiesTable.kind, "bounty"),
          eq(soulTwinOpportunitiesTable.status, "new"),
          sql`${soulTwinOpportunitiesTable.payload}->>'bountyId' = ${String(b.id)}`,
        ),
      )
      .limit(1);

    let row: typeof existing[number] | undefined = existing[0];
    if (!row) {
      const inserted = await db
        .insert(soulTwinOpportunitiesTable)
        .values({
          userId,
          kind: "bounty",
          title,
          summary,
          cta: "View bounty",
          ctaUrl: `/bounties#${b.id}`,
          payload: { bountyId: b.id },
          score: score * 10,
        })
        .returning();
      row = inserted[0];
    }
    if (row) {
      opportunityRecords.push({
        id: row.id,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        cta: row.cta,
        ctaUrl: row.ctaUrl,
      });
    }
  }

  // Generate 2 suggested post topics in the user's voice.
  let suggestedPosts: Array<{ topic: string; draft: string }> = [];
  try {
    const completion = await chatWithFallback(SCAN_MODEL_PRIMARY, {
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are the user\'s Soul Twin. Suggest 2 fresh post ideas in JSON: { "posts": [{ "topic": "...", "draft": "..." }, ...] }. Each draft must be in their voice (see style), 2-4 short paragraphs, no hashtags unless they normally use them. Output JSON only.',
        },
        {
          role: "user",
          content: `My profile:\nName: ${me.displayName}\nOccupation: ${me.occupation ?? ""}\nBio: ${myBio}\nSkills: ${skills}\n\nMy style:\n${styleSummary(style)}\n\nMy 5 most recent posts:\n${recentPosts.map((p, i) => `${i + 1}. ${p.content}`).join("\n")}`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const obj = JSON.parse(text) as { posts?: Array<{ topic?: string; draft?: string }> };
    suggestedPosts = (obj.posts ?? [])
      .filter((p) => typeof p.topic === "string" && typeof p.draft === "string")
      .slice(0, 2)
      .map((p) => ({ topic: String(p.topic), draft: String(p.draft) }));
  } catch (err) {
    logger.warn({ err, userId }, "agent-scan: post suggestion failed");
  }

  return { connections, opportunities: opportunityRecords, suggestedPosts };
}

export async function draftDmFor(userId: string, targetUserId: string, context?: string): Promise<string> {
  const [me, target, style] = await Promise.all([
    db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
    db.query.usersTable.findFirst({ where: eq(usersTable.id, targetUserId) }),
    ensureStyle(userId),
  ]);
  if (!me || !target) throw new Error("user not found");

  const completion = await chatWithFallback(DRAFT_MODEL_PRIMARY, {
    max_completion_tokens: 350,
    messages: [
      {
        role: "system",
        content: `You are ${me.displayName}'s Soul Twin. Draft a short, warm, NON-spammy DM (under 80 words) introducing them to a peer they don't yet know. Match their voice exactly.\n\nVoice profile:\n${styleSummary(style)}`,
      },
      {
        role: "user",
        content: `Recipient: ${target.displayName} (${target.occupation ?? "operator"}).\nTheir bio: ${target.bio ?? "(none)"}\nTheir skills: ${(target.skills ?? []).slice(0, 8).join(", ")}\n\nWhy I want to connect: ${context ?? "skill overlap and shared interests"}.\n\nWrite the DM only — no preface, no sign-off other than my first name.`,
      },
    ],
  });
  return (completion.choices[0]?.message?.content ?? "").trim();
}

export async function listQueue(userId: string) {
  return db
    .select()
    .from(soulTwinActionsTable)
    .where(eq(soulTwinActionsTable.userId, userId))
    .orderBy(desc(soulTwinActionsTable.createdAt))
    .limit(50);
}

export async function queueAction(userId: string, kind: string, payload: Record<string, unknown>, opts?: { targetUserId?: string; targetPostId?: number; reason?: string }) {
  const [row] = await db
    .insert(soulTwinActionsTable)
    .values({
      userId,
      kind,
      status: "pending",
      payload,
      targetUserId: opts?.targetUserId ?? null,
      targetPostId: opts?.targetPostId ?? null,
      reason: opts?.reason ?? null,
    })
    .returning();
  return row;
}

export async function getActionForUser(userId: string, actionId: number) {
  return db.query.soulTwinActionsTable.findFirst({
    where: and(eq(soulTwinActionsTable.id, actionId), eq(soulTwinActionsTable.userId, userId)),
  });
}

export async function resolveAction(userId: string, actionId: number, status: "approved" | "rejected") {
  const [row] = await db
    .update(soulTwinActionsTable)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(soulTwinActionsTable.id, actionId), eq(soulTwinActionsTable.userId, userId)))
    .returning();
  return row;
}

export async function listOpportunities(userId: string) {
  return db
    .select()
    .from(soulTwinOpportunitiesTable)
    .where(and(eq(soulTwinOpportunitiesTable.userId, userId), eq(soulTwinOpportunitiesTable.status, "new")))
    .orderBy(desc(soulTwinOpportunitiesTable.score), desc(soulTwinOpportunitiesTable.createdAt))
    .limit(20);
}

export async function dismissOpportunity(userId: string, oppId: number) {
  await db
    .update(soulTwinOpportunitiesTable)
    .set({ status: "dismissed" })
    .where(and(eq(soulTwinOpportunitiesTable.id, oppId), eq(soulTwinOpportunitiesTable.userId, userId)));
}

export async function followFromOpportunity(userId: string, targetUserId: string): Promise<void> {
  // Idempotent.
  const existing = await db.query.followsTable.findFirst({
    where: and(eq(followsTable.followerId, userId), eq(followsTable.followingId, targetUserId)),
  });
  if (!existing) {
    await db.insert(followsTable).values({ followerId: userId, followingId: targetUserId });
  }
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  if (payload && typeof payload === "object") {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function readPayloadArray(payload: unknown, key: string): string[] {
  if (payload && typeof payload === "object") {
    const v = (payload as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function readPayloadNumber(payload: unknown, key: string): number | undefined {
  if (payload && typeof payload === "object") {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/**
 * Send the queued DM as if the user had typed it themselves. The message
 * lands in the same `direct_messages` table used by the inbox UI, so the
 * recipient sees an indistinguishable conversation entry.
 */
export async function sendDmFromAction(action: SoulTwinAction): Promise<{ messageId: number }> {
  const recipientId = action.targetUserId ?? readPayloadString(action.payload, "recipientId");
  const content = readPayloadString(action.payload, "content")?.trim() ?? "";
  if (!recipientId) throw new Error("dm action missing recipientId");
  if (!content) throw new Error("dm action missing content");
  if (recipientId === action.userId) throw new Error("dm action cannot target self");
  const recipient = await db.query.usersTable.findFirst({ where: eq(usersTable.id, recipientId) });
  if (!recipient) throw new Error("dm recipient not found");
  const msg = await sendDirectMessage({
    senderId: action.userId,
    recipientId,
    content,
  });
  return { messageId: msg.id };
}

/**
 * Publish the queued post under the user's account via the shared
 * `createPostForUser` helper, so the agent path is byte-identical to the
 * user-driven `/posts` route (including Ghost Mode and activity counters).
 */
export async function createPostFromAction(action: SoulTwinAction): Promise<{ postId: number }> {
  const content = readPayloadString(action.payload, "content")?.trim()
    ?? readPayloadString(action.payload, "draft")?.trim()
    ?? "";
  if (!content) throw new Error("post action missing content");
  const post = await createPostForUser({
    authorId: action.userId,
    content,
    imageUrl: readPayloadString(action.payload, "imageUrl") ?? null,
    videoUrl: readPayloadString(action.payload, "videoUrl") ?? null,
    mood: readPayloadString(action.payload, "mood") ?? null,
    hashtags: readPayloadArray(action.payload, "hashtags"),
  });
  return { postId: post.id };
}

/**
 * Add the queued comment to its target post via the shared
 * `createCommentForPost` helper. Notification + activity-counter behaviour
 * is owned by that helper and used by both the user-driven and agent paths.
 */
export async function createCommentFromAction(action: SoulTwinAction): Promise<{ commentId: number }> {
  const postId = action.targetPostId ?? readPayloadNumber(action.payload, "postId");
  const content = readPayloadString(action.payload, "content")?.trim() ?? "";
  if (!postId) throw new Error("comment action missing postId");
  if (!content) throw new Error("comment action missing content");
  const comment = await createCommentForPost({
    authorId: action.userId,
    postId,
    content,
  });
  return { commentId: comment.id };
}

/**
 * Thrown when `executeApprovedAction` is asked to run a row whose `kind`
 * isn't in the supported set. Surfaced so the route can return 4xx instead
 * of silently swallowing malformed queue data.
 */
export class UnknownAgentActionKindError extends Error {
  constructor(public readonly kind: string) {
    super(`Unknown agent action kind: ${kind}`);
    this.name = "UnknownAgentActionKindError";
  }
}

/**
 * Side-effect IDs produced by a successful execution. Surfaced so the
 * autonomy notification (and any future auditing) can deep-link the user
 * back to the message/post/comment the agent created on their behalf.
 */
export interface ExecutionResult {
  messageId?: number;
  postId?: number;
  commentId?: number;
}

export interface ExecutedAction {
  action: SoulTwinAction;
  result: ExecutionResult;
  /**
   * True when *this* call won the atomic claim and ran the side effect.
   * False when a parallel caller had already claimed it (in which case
   * `result` is empty and the latest persisted row is returned). Callers
   * that have post-execute side effects of their own — like the autonomy
   * notification — should gate on this so only the winner runs them.
   */
  claimedByCaller: boolean;
}

/**
 * Run the side-effect for an action whose status was just flipped to
 * `approved`, then stamp `executedAt`. Race-safe via an atomic claim: the
 * very first thing we do is conditionally `UPDATE ... WHERE executed_at IS
 * NULL AND status = 'approved'`, so two concurrent approvals (e.g. a
 * double-click, or autonomy racing a manual click) can never both send the
 * side effect — only the winning UPDATE proceeds — and a row that isn't
 * actually approved (rejected, still pending) can never be executed by
 * accident. On execution failure we clear `executed_at` again so the row
 * stays retryable.
 */
export async function executeApprovedAction(action: SoulTwinAction): Promise<ExecutedAction> {
  if (action.executedAt) return { action, result: {}, claimedByCaller: false };
  // Defensive guard so a misuse from another call site can't execute a row
  // whose status isn't `approved` (e.g. still pending, or rejected).
  if (action.status !== "approved") {
    throw new Error(`Cannot execute action ${action.id}: status is "${action.status}", expected "approved"`);
  }
  // Atomic claim — only one caller per row gets a non-empty result, and
  // only when status is still `approved` at claim time. We also bump
  // `attemptCount` and stamp `lastAttemptAt` here so the background retry
  // sweep sees the right post-attempt state regardless of whether this
  // call succeeds or throws below.
  const claimedAt = new Date();
  const [claimed] = await db
    .update(soulTwinActionsTable)
    .set({
      executedAt: claimedAt,
      lastAttemptAt: claimedAt,
      attemptCount: sql`${soulTwinActionsTable.attemptCount} + 1`,
    })
    .where(and(
      eq(soulTwinActionsTable.id, action.id),
      eq(soulTwinActionsTable.status, "approved"),
      sql`${soulTwinActionsTable.executedAt} IS NULL`,
    ))
    .returning();
  if (!claimed) {
    // Another caller already claimed (and likely executed) this row, or the
    // row is no longer approved. Return the latest persisted row so the
    // client sees authoritative state.
    const latest = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, action.id),
    });
    return { action: latest ?? action, result: {}, claimedByCaller: false };
  }
  try {
    const result: ExecutionResult = {};
    if (claimed.kind === "follow" && claimed.targetUserId) {
      await followFromOpportunity(claimed.userId, claimed.targetUserId);
    } else if (claimed.kind === "dm") {
      const r = await sendDmFromAction(claimed);
      result.messageId = r.messageId;
    } else if (claimed.kind === "post") {
      const r = await createPostFromAction(claimed);
      result.postId = r.postId;
    } else if (claimed.kind === "comment") {
      const r = await createCommentFromAction(claimed);
      result.commentId = r.commentId;
    } else {
      // Unknown kind — release the claim and immediately mark the row as
      // permanently failed (retrying will never resolve a kind the
      // executor doesn't know how to run). Surface the error so the
      // caller can return a 4xx instead of silently logging.
      logger.warn({ kind: claimed.kind, actionId: claimed.id }, "agent: unknown action kind");
      await db
        .update(soulTwinActionsTable)
        .set({
          executedAt: null,
          status: "failed",
          lastError: `Unknown action kind: ${claimed.kind}`,
          lastErrorCode: "unknown_kind",
        })
        .where(eq(soulTwinActionsTable.id, claimed.id))
        .catch(() => {});
      throw new UnknownAgentActionKindError(claimed.kind);
    }
    // Persist the result IDs back onto the action's payload so the Undo
    // path can reverse the side effect from the action row alone (without
    // having to walk notification metadata to recover the messageId/postId/
    // commentId we just produced).
    let postExecuted = claimed;
    const successPatch: Record<string, unknown> = {};
    if (result.messageId !== undefined || result.postId !== undefined || result.commentId !== undefined) {
      successPatch["payload"] = {
        ...(typeof claimed.payload === "object" && claimed.payload !== null ? (claimed.payload as Record<string, unknown>) : {}),
        ...(result.messageId !== undefined ? { resultMessageId: result.messageId } : {}),
        ...(result.postId !== undefined ? { resultPostId: result.postId } : {}),
        ...(result.commentId !== undefined ? { resultCommentId: result.commentId } : {}),
      };
    }
    // Clear any stale `lastError` / `lastErrorCode` from a previous failed
    // attempt — a row that ultimately succeeded shouldn't keep displaying
    // yesterday's error in the History UI.
    if (claimed.lastError !== null) {
      successPatch["lastError"] = null;
    }
    if (claimed.lastErrorCode !== null) {
      successPatch["lastErrorCode"] = null;
    }
    if (Object.keys(successPatch).length > 0) {
      const [updated] = await db
        .update(soulTwinActionsTable)
        .set(successPatch)
        .where(eq(soulTwinActionsTable.id, claimed.id))
        .returning();
      if (updated) postExecuted = updated;
    }
    return { action: postExecuted, result, claimedByCaller: true };
  } catch (err) {
    if (err instanceof UnknownAgentActionKindError) {
      // Already persisted as `status="failed"` in the unknown-kind branch
      // above; just propagate.
      throw err;
    }
    logger.error({ err, actionId: claimed.id, kind: claimed.kind, userId: claimed.userId, attemptCount: claimed.attemptCount }, "agent: action execution failed");
    // Release the claim so the row is retryable, capture the error for
    // surfacing in the UI, and — if this attempt exhausted the cap —
    // flip status to `failed` so the background sweep stops trying and
    // the History tab can render "Gave up" instead of "Failed - Retry"
    // forever. Best-effort: even if this update fails the row is still
    // marked executed (false positive), which is the safer failure mode
    // (no duplicate side effects).
    const code = classifyExecutionError(err);
    // We deliberately keep the existing autonomy contract here: a failed
    // first attempt stays as status="approved" + executedAt=null so the
    // audit trail and existing UI language ("approved-but-failed") still
    // hold. The background sweep — which already owns the give-up
    // transition — is responsible for flipping permanent-coded rows
    // (lastErrorCode ∉ RETRYABLE_ERROR_CODES) to status="failed" without
    // burning further attempts on them. The UI's Retry-button gating
    // hides the button as soon as lastErrorCode is set, regardless of
    // status, so the user-visible behaviour is the same either way.
    const gaveUp = claimed.attemptCount >= MAX_ATTEMPTS;
    await db
      .update(soulTwinActionsTable)
      .set({
        executedAt: null,
        lastError: truncateError(err),
        lastErrorCode: code,
        ...(gaveUp ? { status: "failed" as const } : {}),
      })
      .where(eq(soulTwinActionsTable.id, claimed.id))
      .catch(() => {});
    throw err;
  }
}

/**
 * Window during which a fresh autonomy execution will be folded into the
 * existing unread "Soul Twin acted on your behalf" notification rather
 * than inserted as a brand-new row. This keeps a busy autonomy day from
 * spamming the inbox with N near-identical lines while still surfacing
 * activity quickly (a notification stays "live" for a few minutes after
 * the previous execution before a new one starts a fresh thread).
 */
const AUTONOMY_NOTIFY_BUNDLE_WINDOW_MS = 5 * 60 * 1000;

interface AutonomyNotificationEntry {
  actionId: number;
  kind: string;
  label: string;
  /** Deep link to the resulting message/post/profile, when one exists. */
  link: string | null;
  /** Deep link back to the queue/audit row for this action. */
  auditLink: string;
  messageId?: number;
  postId?: number;
  commentId?: number;
  /**
   * ISO timestamp of when the side-effect ran. The client uses this to
   * gate the per-entry "Undo" affordance — once it's older than the
   * server-side grace window the button hides itself client-side and the
   * server rejects the undo too.
   */
  executedAt?: string;
  /** True once the user has used the Undo affordance to revert this entry. */
  reverted?: boolean;
  /** ISO timestamp when the entry was reverted, when `reverted` is true. */
  revertedAt?: string;
}

interface AutonomyNotificationMetadata {
  count: number;
  actions: AutonomyNotificationEntry[];
}

function isAutonomyNotificationMetadata(value: unknown): value is AutonomyNotificationMetadata {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { count?: unknown }).count === "number" &&
      Array.isArray((value as { actions?: unknown }).actions),
  );
}

async function buildAutonomyEntry(action: SoulTwinAction, result: ExecutionResult): Promise<AutonomyNotificationEntry> {
  const targetUserId = action.targetUserId ?? readPayloadString(action.payload, "recipientId") ?? null;
  let targetHandle: string | null = readPayloadString(action.payload, "targetName") ?? null;
  if (!targetHandle && targetUserId) {
    const target = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, targetUserId),
      columns: { username: true, displayName: true },
    });
    targetHandle = target ? `@${target.username}` : null;
  }
  const auditLink = `/ai/soul-twin?action=${action.id}`;
  // Use the action's stamped executedAt if present; else fall back to "now".
  // The frontend uses this to gate the per-entry Undo affordance.
  const executedAt = (action.executedAt instanceof Date ? action.executedAt : new Date()).toISOString();
  if (action.kind === "dm") {
    return {
      actionId: action.id,
      kind: "dm",
      label: targetHandle ? `Sent a DM to ${targetHandle}` : "Sent a DM",
      link: targetUserId ? `/messages?with=${targetUserId}` : "/messages",
      auditLink,
      messageId: result.messageId,
      executedAt,
    };
  }
  if (action.kind === "post") {
    return {
      actionId: action.id,
      kind: "post",
      label: "Published a post",
      link: result.postId ? `/feed?post=${result.postId}` : "/feed",
      auditLink,
      postId: result.postId,
      executedAt,
    };
  }
  if (action.kind === "comment") {
    const postId = action.targetPostId ?? readPayloadNumber(action.payload, "postId");
    return {
      actionId: action.id,
      kind: "comment",
      label: "Posted a comment",
      link: postId ? `/feed?post=${postId}` : "/feed",
      auditLink,
      commentId: result.commentId,
      postId,
      executedAt,
    };
  }
  if (action.kind === "follow") {
    return {
      actionId: action.id,
      kind: "follow",
      label: targetHandle ? `Followed ${targetHandle}` : "Followed someone",
      link: targetUserId ? `/profile/${targetUserId}` : null,
      auditLink,
      executedAt,
    };
  }
  return {
    actionId: action.id,
    kind: action.kind,
    label: `Ran ${action.kind} action`,
    link: null,
    auditLink,
    executedAt,
  };
}

function summaryMessage(entries: AutonomyNotificationEntry[]): string {
  if (entries.length === 1) return `Soul Twin ${entries[0].label.charAt(0).toLowerCase()}${entries[0].label.slice(1)} on your behalf.`;
  return `Soul Twin took ${entries.length} actions on your behalf — tap to review.`;
}

/**
 * Insert (or fold into an existing unread row) a notification announcing
 * that the autonomy path just took an action under the user's name. We
 * bundle within `AUTONOMY_NOTIFY_BUNDLE_WINDOW_MS` so a busy run doesn't
 * spam the inbox; once the user reads the notification (or the window
 * elapses) the next execution starts a fresh row.
 */
async function notifyAutonomyExecution(action: SoulTwinAction, result: ExecutionResult): Promise<void> {
  try {
    const entry = await buildAutonomyEntry(action, result);
    const cutoff = new Date(Date.now() - AUTONOMY_NOTIFY_BUNDLE_WINDOW_MS);
    const existing = await db.query.notificationsTable.findFirst({
      where: and(
        eq(notificationsTable.userId, action.userId),
        eq(notificationsTable.type, "agent_executed"),
        eq(notificationsTable.read, false),
        gte(notificationsTable.createdAt, cutoff),
      ),
      orderBy: desc(notificationsTable.createdAt),
    });
    if (existing) {
      const prev = isAutonomyNotificationMetadata(existing.metadata)
        ? existing.metadata
        : { count: 1, actions: [] as AutonomyNotificationEntry[] };
      // Don't double-record the same action if this helper somehow runs twice.
      if (prev.actions.some((a) => a.actionId === entry.actionId)) return;
      const merged: AutonomyNotificationMetadata = {
        count: prev.count + 1,
        actions: [...prev.actions, entry].slice(-10),
      };
      await db
        .update(notificationsTable)
        .set({
          message: summaryMessage(merged.actions),
          metadata: merged,
          createdAt: new Date(),
        })
        .where(eq(notificationsTable.id, existing.id));
      return;
    }
    const metadata: AutonomyNotificationMetadata = { count: 1, actions: [entry] };
    await db.insert(notificationsTable).values({
      userId: action.userId,
      type: "agent_executed",
      message: summaryMessage(metadata.actions),
      metadata,
    });
    // Out-of-band heads-up: only fire when a brand-new notification row
    // is created (the bundling branch above merges quietly into the
    // existing unread row, so the user has already been pinged for that
    // burst). Fire-and-forget so a Resend/Expo outage can't roll back
    // the autonomy side effect or block further executions.
    const outboundEntries: OutboundEntry[] = metadata.actions.map((a) => ({
      kind: a.kind,
      label: a.label,
      link: a.link,
    }));
    void deliverAutonomyHeadsUpDispatch(action.userId, outboundEntries).catch((err) => {
      logger.warn({ err, userId: action.userId, actionId: action.id }, "agent autonomy: out-of-band heads-up dispatch threw");
    });
  } catch (err) {
    // Notifications are best-effort: a failure here must not roll back the
    // already-committed side effect or block further autonomy.
    logger.warn({ err, actionId: action.id, userId: action.userId }, "agent autonomy: failed to insert execution notification");
  }
}

/**
 * If the user has Set & Forget on, immediately approve and execute the
 * just-queued action — but only while they're under the daily autonomy cap.
 * Returns the (possibly updated) row so the caller can surface execution
 * state to the client.
 */
export async function maybeAutoExecute(action: SoulTwinAction): Promise<SoulTwinAction> {
  const me = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, action.userId),
    columns: { agentAutonomyEnabled: true, agentModeEnabled: true, agentConsentedAt: true },
  });
  if (!me?.agentAutonomyEnabled || !me.agentModeEnabled || !me.agentConsentedAt) return action;
  // Calendar-day window: the autonomy cap visibly resets at UTC midnight,
  // matching the "daily cap" wording the product copy uses. A rolling-24h
  // window would otherwise leave a user who hit their first action at
  // 11:30pm Monday locked until 11:30pm Tuesday.
  const limit = await checkAndIncrement(`autonomy:${action.userId}`, AUTONOMY_DAILY_LIMIT, {
    windowMode: "calendar-day",
  });
  if (!limit.allowed) {
    logger.info({ userId: action.userId, actionId: action.id }, "agent: autonomy cap reached, leaving action pending");
    return action;
  }
  const [approved] = await db
    .update(soulTwinActionsTable)
    .set({ status: "approved", resolvedAt: new Date() })
    .where(eq(soulTwinActionsTable.id, action.id))
    .returning();
  const target = approved ?? action;
  try {
    const executed = await executeApprovedAction(target);
    // Only the caller that won the atomic claim inside
    // `executeApprovedAction` actually ran the side effect, and only it
    // has populated `result` IDs for deep-linking. Gate notification on
    // that flag so a parallel autonomy/approve caller that lost the
    // race doesn't insert a less-precise duplicate.
    if (executed.claimedByCaller) {
      await notifyAutonomyExecution(executed.action, executed.result);
    }
    return executed.action;
  } catch (err) {
    // Execution failed — keep the row marked approved (audit trail) but
    // without `executedAt`, which is exactly what the column was added for.
    // (Unknown-kind is the exception: `executeApprovedAction` flips it to
    // `status="failed"` immediately so retrying won't help.) We swallow
    // the error here because autonomy runs in the queue-create request
    // and we don't want a model-malformed `kind` (or a transient DM/post
    // failure) to block the user from queueing more actions.
    if (err instanceof UnknownAgentActionKindError) {
      logger.warn({ actionId: target.id, kind: err.kind }, "agent autonomy: unknown action kind, marked row as failed");
    }
    // Re-fetch so the caller (queue-create route) sees post-attempt
    // state — bumped attemptCount, lastError, and possibly
    // status="failed" — instead of the stale pre-execution snapshot.
    const latest = await db.query.soulTwinActionsTable.findFirst({
      where: eq(soulTwinActionsTable.id, target.id),
    });
    return latest ?? target;
  }
}

/**
 * How long after the side-effect ran the user can still hit "Undo" from
 * the autonomy notification. Tuned to roughly mirror common "unsend"
 * windows in mainstream messaging clients — long enough that a user
 * who notices the notification can react, short enough that the
 * recipient/community has typically not yet engaged with the content.
 *
 * The frontend hides the button after this elapses; this constant is the
 * server-side enforcement so an undo can't be replayed from a stale tab
 * after the grace window has passed.
 */
export const UNDO_GRACE_MS = 10 * 60 * 1000;

/** Public undo error shape so the route can map to clean HTTP statuses. */
export class UndoNotAllowedError extends Error {
  constructor(public readonly status: 404 | 409 | 410, message: string) {
    super(message);
    this.name = "UndoNotAllowedError";
  }
}

interface UndoOutcome {
  /** True when the side-effect was actually deleted (vs already gone). */
  reverted: boolean;
  kind: string;
}

/**
 * Mark the matching entry inside the agent_executed notification's
 * metadata as `reverted`, so the UI can render it as "Reverted" instead
 * of offering Undo. Best-effort: failure to update doesn't roll back the
 * already-deleted side effect (the action row's payload is the source of
 * truth for whether undo ran).
 */
async function markNotificationEntryReverted(userId: string, actionId: number): Promise<void> {
  try {
    // Search recent agent_executed notifications for one whose metadata
    // contains an entry with this actionId. We bound by the grace window
    // since older notifications can't have a matching un-reverted entry.
    const cutoff = new Date(Date.now() - UNDO_GRACE_MS - AUTONOMY_NOTIFY_BUNDLE_WINDOW_MS);
    const candidates = await db
      .select()
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, "agent_executed"),
        gte(notificationsTable.createdAt, cutoff),
      ))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);
    for (const n of candidates) {
      if (!isAutonomyNotificationMetadata(n.metadata)) continue;
      const idx = n.metadata.actions.findIndex((a) => a.actionId === actionId);
      if (idx < 0) continue;
      const next: AutonomyNotificationMetadata = {
        count: n.metadata.count,
        actions: n.metadata.actions.map((a, i) =>
          i === idx ? { ...a, reverted: true, revertedAt: new Date().toISOString() } : a,
        ),
      };
      await db
        .update(notificationsTable)
        .set({ metadata: next })
        .where(eq(notificationsTable.id, n.id));
      return;
    }
  } catch (err) {
    logger.warn({ err, userId, actionId }, "agent undo: failed to mark notification entry reverted");
  }
}

/**
 * Reverse the side-effect of a previously-executed Soul Twin action,
 * within the `UNDO_GRACE_MS` window. Caller must own the action.
 *
 * Resolution rules:
 *  - dm:      delete the produced direct message (we re-verify sender = user
 *             so this can't be used to delete a peer's reply).
 *  - post:    delete the produced post (and cascade its likes/comments).
 *  - comment: delete the produced comment + the post-owner notification it
 *             generated, so reverting also retracts the "someone commented"
 *             ping the parent author may have just received.
 *  - follow:  delete the follows row.
 *
 * Idempotent: if the user double-clicks, the second call short-circuits
 * because `payload.revertedAt` is already set.
 */
export async function undoExecutedAction(userId: string, actionId: number): Promise<UndoOutcome> {
  const action = await db.query.soulTwinActionsTable.findFirst({
    where: and(eq(soulTwinActionsTable.id, actionId), eq(soulTwinActionsTable.userId, userId)),
  });
  if (!action) throw new UndoNotAllowedError(404, "Action not found");
  if (!action.executedAt) throw new UndoNotAllowedError(409, "Action has not executed yet");
  // Idempotency: a second click is a no-op success rather than a 4xx.
  if (readPayloadString(action.payload, "revertedAt")) {
    return { reverted: false, kind: action.kind };
  }
  const ageMs = Date.now() - new Date(action.executedAt).getTime();
  if (ageMs > UNDO_GRACE_MS) {
    throw new UndoNotAllowedError(410, "Undo window has elapsed");
  }

  if (action.kind === "dm") {
    const messageId = readPayloadNumber(action.payload, "resultMessageId");
    if (messageId !== undefined) {
      // Capture conversationId + recipientId BEFORE the delete so we can
      // tell the recipient's (and the sender's other tabs') open inbox
      // that this bubble was retracted. Without this lookup the row is
      // gone before we know who to notify.
      const before = await db.query.directMessagesTable.findFirst({
        where: and(
          eq(directMessagesTable.id, messageId),
          eq(directMessagesTable.senderId, userId),
        ),
        columns: { id: true, conversationId: true, recipientId: true },
      });
      await db
        .delete(directMessagesTable)
        .where(and(
          eq(directMessagesTable.id, messageId),
          eq(directMessagesTable.senderId, userId),
        ));
      if (before) {
        // Publish to BOTH parties so the sender's other open tabs flip
        // the bubble too. Best-effort: any SSE write failure is swallowed
        // by sse-bus and must not roll back the already-deleted row.
        const payload = {
          type: "unsent" as const,
          conversationId: before.conversationId,
          messageId: before.id,
          at: new Date().toISOString(),
        };
        try {
          publish("dm-inbox", before.recipientId, payload);
          publish("dm-inbox", userId, payload);
        } catch (err) {
          logger.warn({ err, messageId }, "agent undo: dm unsent broadcast failed");
        }
      }
    }
  } else if (action.kind === "post") {
    const postId = readPayloadNumber(action.payload, "resultPostId");
    if (postId !== undefined) {
      await db
        .delete(postsTable)
        .where(and(eq(postsTable.id, postId), eq(postsTable.authorId, userId)));
    }
  } else if (action.kind === "comment") {
    const commentId = readPayloadNumber(action.payload, "resultCommentId");
    if (commentId !== undefined) {
      // Capture postId BEFORE the delete so we can tell the post owner's
      // open feed view to drop the row in real time.
      const before = await db.query.commentsTable.findFirst({
        where: and(eq(commentsTable.id, commentId), eq(commentsTable.authorId, userId)),
        columns: { id: true, postId: true },
      });
      const [deleted] = await db
        .delete(commentsTable)
        .where(and(eq(commentsTable.id, commentId), eq(commentsTable.authorId, userId)))
        .returning();
      // Best-effort: also retract the "someone commented on your post"
      // notification we created in createCommentForPost so the post owner
      // doesn't keep seeing a stale ping for a comment that no longer
      // exists. Identified via metadata.commentId set at insert time.
      if (deleted) {
        await db
          .delete(notificationsTable)
          .where(and(
            eq(notificationsTable.type, "comment"),
            sql`${notificationsTable.metadata}->>'commentId' = ${String(commentId)}`,
          ))
          .catch(() => {});
        if (before) {
          // Look up the post owner so the SSE event lands on their feed
          // channel — that's who's most likely to have the comment list
          // open (they got the original "someone commented" notification
          // we just deleted above).
          const post = await db.query.postsTable.findFirst({
            where: eq(postsTable.id, before.postId),
            columns: { id: true, authorId: true },
          });
          if (post) {
            const payload = {
              type: "comment-removed" as const,
              postId: post.id,
              commentId: deleted.id,
              at: new Date().toISOString(),
            };
            try {
              publish("feed", post.authorId, payload);
              // Also tell the commenter's own tabs so any open feed view
              // they have on the same post drops the row too.
              if (post.authorId !== userId) {
                publish("feed", userId, payload);
              }
            } catch (err) {
              logger.warn({ err, commentId }, "agent undo: comment-removed broadcast failed");
            }
          }
        }
      }
    }
  } else if (action.kind === "follow") {
    const targetUserId = action.targetUserId;
    if (targetUserId) {
      await db
        .delete(followsTable)
        .where(and(eq(followsTable.followerId, userId), eq(followsTable.followingId, targetUserId)));
    }
  } else {
    throw new UndoNotAllowedError(409, `Cannot undo action of kind "${action.kind}"`);
  }

  // Stamp revertedAt onto payload so subsequent calls short-circuit and
  // so the queue/history UI can show this row as "Reverted" rather than
  // "Sent/Posted".
  const payloadObj = (typeof action.payload === "object" && action.payload !== null
    ? (action.payload as Record<string, unknown>)
    : {});
  await db
    .update(soulTwinActionsTable)
    .set({ payload: { ...payloadObj, revertedAt: new Date().toISOString() } })
    .where(eq(soulTwinActionsTable.id, action.id));

  await markNotificationEntryReverted(userId, action.id);

  return { reverted: true, kind: action.kind };
}
