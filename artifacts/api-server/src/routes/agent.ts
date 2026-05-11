import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { ensureUser } from "./users";
import { logger } from "../lib/logger";
import { checkAndIncrement } from "../lib/rate-limit";
import { requireAgentConsent } from "../lib/agent-consent";
import { refreshStyleProfile, getStyleProfile } from "../lib/style-profile";
import {
  scanForOpportunities,
  draftDmFor,
  listQueue,
  queueAction,
  resolveAction,
  listOpportunities,
  dismissOpportunity,
  executeApprovedAction,
  UnknownAgentActionKindError,
  maybeAutoExecute,
  getActionForUser,
  undoExecutedAction,
  UndoNotAllowedError,
} from "../lib/agent-actions";

const router = Router();

const SCAN_DAILY_LIMIT = 20;
const DRAFT_DAILY_LIMIT = 30;
const QUEUE_DAILY_LIMIT = 50;
const RESOLVE_DAILY_LIMIT = 100;
const RETRY_DAILY_LIMIT = 50;

router.post("/ai/soul-twin/agent/scan", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const consent = await requireAgentConsent(user.id);
  if (!consent.ok) { res.status(consent.status).json({ error: consent.error }); return; }
  const limit = await checkAndIncrement(`scan:${user.id}`, SCAN_DAILY_LIMIT);
  if (!limit.allowed) {
    res.status(429).json({ error: "Daily scan limit reached", resetAt: new Date(limit.resetAt).toISOString() });
    return;
  }
  try {
    const result = await scanForOpportunities(user.id);
    res.json(result);
  } catch (err) {
    logger.error({ err, userId: user.id }, "soul-twin: scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

const DraftDmBody = z.object({
  targetUserId: z.string().min(1),
  context: z.string().max(500).optional(),
});

router.post("/ai/soul-twin/agent/draft-dm", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = DraftDmBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await ensureUser(clerkId);
  const consent = await requireAgentConsent(user.id);
  if (!consent.ok) { res.status(consent.status).json({ error: consent.error }); return; }
  const limit = await checkAndIncrement(`draft:${user.id}`, DRAFT_DAILY_LIMIT);
  if (!limit.allowed) {
    res.status(429).json({ error: "Daily draft limit reached", resetAt: new Date(limit.resetAt).toISOString() });
    return;
  }
  try {
    const draft = await draftDmFor(user.id, parsed.data.targetUserId, parsed.data.context);
    res.json({ draft });
  } catch (err) {
    logger.error({ err, userId: user.id }, "soul-twin: draft-dm failed");
    res.status(500).json({ error: "Draft failed" });
  }
});

router.get("/ai/soul-twin/agent/queue", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  res.json({ actions: await listQueue(user.id) });
});

// Kind-specific queue ingress validation. Catches malformed rows at the
// boundary so they can never reach the approve/autonomy execution path
// (e.g. a `follow` queued without a `targetUserId`, or a `dm` without a
// `recipientId`). The shape of `payload` per kind mirrors what the
// per-kind executors in `agent-actions.ts` actually read.
const QueueActionBody = z.object({
  kind: z.enum(["dm", "follow", "post", "comment"]),
  payload: z.record(z.string(), z.unknown()),
  targetUserId: z.string().optional(),
  targetPostId: z.number().optional(),
  reason: z.string().max(500).optional(),
}).superRefine((row, ctx) => {
  const payload = row.payload as Record<string, unknown>;
  const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  if (row.kind === "follow") {
    if (!row.targetUserId || row.targetUserId.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "follow action requires `targetUserId`", path: ["targetUserId"] });
    }
  } else if (row.kind === "dm") {
    // The executor accepts either `targetUserId` (canonical, used by
    // opportunity-driven flows) or `payload.recipientId` (legacy, used by
    // some clients). Mirror that here so the boundary doesn't reject rows
    // the executor would happily run.
    const hasRecipient = (row.targetUserId && row.targetUserId.length > 0)
      || isNonEmptyString(payload.recipientId);
    if (!hasRecipient) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dm action requires `targetUserId` or `payload.recipientId`", path: ["targetUserId"] });
    }
    if (!isNonEmptyString(payload.content)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dm action requires non-empty `payload.content`", path: ["payload", "content"] });
    }
  } else if (row.kind === "post") {
    if (!isNonEmptyString(payload.content) && !isNonEmptyString(payload.draft)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "post action requires non-empty `payload.content` or `payload.draft`", path: ["payload", "content"] });
    }
  } else if (row.kind === "comment") {
    if (!isNonEmptyString(payload.content)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "comment action requires non-empty `payload.content`", path: ["payload", "content"] });
    }
    const postIdInPayload = typeof payload.postId === "number" ? payload.postId : null;
    if (row.targetPostId == null && postIdInPayload == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "comment action requires `targetPostId` or `payload.postId`", path: ["targetPostId"] });
    }
  }
});

router.post("/ai/soul-twin/agent/queue", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = QueueActionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await ensureUser(clerkId);
  const consent = await requireAgentConsent(user.id);
  if (!consent.ok) { res.status(consent.status).json({ error: consent.error }); return; }
  const queueLimit = await checkAndIncrement(`queue:${user.id}`, QUEUE_DAILY_LIMIT);
  if (!queueLimit.allowed) {
    res.status(429).json({ error: "Daily queue limit reached", resetAt: new Date(queueLimit.resetAt).toISOString() });
    return;
  }
  const row = await queueAction(user.id, parsed.data.kind, parsed.data.payload, {
    targetUserId: parsed.data.targetUserId,
    targetPostId: parsed.data.targetPostId,
    reason: parsed.data.reason,
  });
  // Set & Forget: if the user has autonomy on, run the side-effect right
  // away and return the post-execution row so the client can show the
  // updated status without a follow-up roundtrip.
  const final = await maybeAutoExecute(row);
  res.status(201).json(final);
});

router.post("/ai/soul-twin/agent/queue/:actionId/approve", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const consent = await requireAgentConsent(user.id);
  if (!consent.ok) { res.status(consent.status).json({ error: consent.error }); return; }
  const approveLimit = await checkAndIncrement(`approve:${user.id}`, RESOLVE_DAILY_LIMIT);
  if (!approveLimit.allowed) {
    res.status(429).json({ error: "Daily approve limit reached", resetAt: new Date(approveLimit.resetAt).toISOString() });
    return;
  }
  const id = Number(req.params.actionId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await resolveAction(user.id, id, "approved");
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // Run the real-world side-effect (DM send, post publish, comment, follow)
  // and stamp `executedAt`. Surface execution failure as 500 so the client
  // can keep the row visible for retry — the audit row stays in `approved`
  // status with a NULL `executedAt`, which is the signal of a failed run.
  try {
    const executed = await executeApprovedAction(row);
    res.json(executed.action);
  } catch (err) {
    if (err instanceof UnknownAgentActionKindError) {
      // Malformed queue row (kind isn't in the supported set). Surface as
      // 422 so the client can see this isn't a transient failure to retry.
      // Re-fetch the row so the response reflects the persisted
      // `status="failed"` that `executeApprovedAction` wrote on the
      // unknown-kind branch (instead of the stale pre-execution snapshot).
      logger.warn({ actionId: id, kind: row.kind, userId: user.id }, "soul-twin: approve called on unknown action kind");
      const latest = (await getActionForUser(user.id, id)) ?? row;
      res.status(422).json({ error: `Unknown action kind: ${err.kind}`, action: latest });
      return;
    }
    logger.error({ err, actionId: id, kind: row.kind, userId: user.id }, "soul-twin: approve execution failed");
    // Re-fetch so the client sees the post-attempt state (bumped
    // attemptCount, lastError, and possibly `status="failed"` if this
    // attempt exhausted the cap).
    const latest = (await getActionForUser(user.id, id)) ?? row;
    res.status(500).json({ error: "Action approved but execution failed", action: latest });
  }
});

router.post("/ai/soul-twin/agent/queue/:actionId/reject", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const consent = await requireAgentConsent(user.id);
  if (!consent.ok) { res.status(consent.status).json({ error: consent.error }); return; }
  const rejectLimit = await checkAndIncrement(`reject:${user.id}`, RESOLVE_DAILY_LIMIT);
  if (!rejectLimit.allowed) {
    res.status(429).json({ error: "Daily reject limit reached", resetAt: new Date(rejectLimit.resetAt).toISOString() });
    return;
  }
  const id = Number(req.params.actionId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const row = await resolveAction(user.id, id, "rejected");
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.post("/ai/soul-twin/agent/queue/:actionId/retry", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const consent = await requireAgentConsent(user.id);
  if (!consent.ok) { res.status(consent.status).json({ error: consent.error }); return; }
  const id = Number(req.params.actionId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Ownership check before consuming the rate limit so probes against
  // someone else's row can't burn the caller's daily quota.
  const row = await getActionForUser(user.id, id);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.status !== "approved") {
    res.status(409).json({ error: `Cannot retry: status is "${row.status}"`, action: row });
    return;
  }
  if (row.executedAt) {
    // Idempotent: already executed, nothing to do.
    res.json(row);
    return;
  }
  const retryLimit = await checkAndIncrement(`retry:${user.id}`, RETRY_DAILY_LIMIT);
  if (!retryLimit.allowed) {
    res.status(429).json({ error: "Daily retry limit reached", resetAt: new Date(retryLimit.resetAt).toISOString() });
    return;
  }
  try {
    const executed = await executeApprovedAction(row);
    // Return the action row (matches the /approve endpoint's shape) so
    // the client doesn't have to branch on which endpoint it called to
    // dig out `.action` vs use the response directly.
    res.json(executed.action);
  } catch (err) {
    if (err instanceof UnknownAgentActionKindError) {
      logger.warn({ actionId: id, kind: row.kind, userId: user.id }, "soul-twin: retry called on unknown action kind");
      // Re-fetch so the response carries the persisted `status="failed"`
      // (and bumped attemptCount/lastError) that executeApprovedAction
      // wrote, not the stale pre-execution snapshot.
      const latest = (await getActionForUser(user.id, id)) ?? row;
      res.status(422).json({ error: `Unknown action kind: ${err.kind}`, action: latest });
      return;
    }
    logger.error({ err, actionId: id, kind: row.kind, userId: user.id }, "soul-twin: retry execution failed");
    const latest = (await getActionForUser(user.id, id)) ?? row;
    res.status(500).json({ error: "Retry failed", action: latest });
  }
});

const UNDO_DAILY_LIMIT = 50;

router.post("/ai/soul-twin/agent/executed/:actionId/undo", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  // Note: no consent check here. If autonomy already executed an action,
  // we want the user to be able to take it back even if they've since
  // turned off agent mode — that's the whole point of an undo affordance.
  const id = Number(req.params.actionId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Ownership check before consuming the rate limit so probes against
  // someone else's row can't burn the caller's daily quota.
  const owned = await getActionForUser(user.id, id);
  if (!owned) { res.status(404).json({ error: "Not found" }); return; }
  const limit = await checkAndIncrement(`undo:${user.id}`, UNDO_DAILY_LIMIT);
  if (!limit.allowed) {
    res.status(429).json({ error: "Daily undo limit reached", resetAt: new Date(limit.resetAt).toISOString() });
    return;
  }
  try {
    const outcome = await undoExecutedAction(user.id, id);
    res.json({ success: true, ...outcome });
  } catch (err) {
    if (err instanceof UndoNotAllowedError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    logger.error({ err, actionId: id, userId: user.id }, "soul-twin: undo failed");
    res.status(500).json({ error: "Undo failed" });
  }
});

router.post("/ai/soul-twin/style/refresh", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const limit = await checkAndIncrement(`style:${user.id}`, 5);
  if (!limit.allowed) {
    res.status(429).json({ error: "Style refresh limit reached", resetAt: new Date(limit.resetAt).toISOString() });
    return;
  }
  try {
    const profile = await refreshStyleProfile(user.id);
    res.json(profile);
  } catch (err) {
    logger.error({ err, userId: user.id }, "soul-twin: style refresh failed");
    res.status(500).json({ error: "Style refresh failed" });
  }
});

router.get("/ai/soul-twin/style", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  res.json(await getStyleProfile(user.id));
});

router.get("/ai/soul-twin/opportunities", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  res.json({ opportunities: await listOpportunities(user.id) });
});

router.post("/ai/soul-twin/opportunities/:oppId/dismiss", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const id = Number(req.params.oppId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await dismissOpportunity(user.id, id);
  res.json({ success: true });
});

export default router;
