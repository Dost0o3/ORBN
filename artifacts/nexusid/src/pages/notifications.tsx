import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Bot, Check, X, RefreshCw, Undo2 } from "lucide-react";
import { MobileFeedTopBar } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useListNotifications, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, string> = {
  like: "❤️",
  comment: "💬",
  follow: "👥",
  repost: "🔁",
  mention: "📣",
  job: "💼",
  agent_executed: "🤖",
  report_actioned: "🛡️",
  report_dismissed: "🛡️",
  chat_screenshot: "📸",
};

interface AutonomyAction {
  actionId: number;
  kind: string;
  label: string;
  link: string | null;
  auditLink?: string;
  executedAt?: string;
  reverted?: boolean;
  revertedAt?: string;
}

interface AutonomyMetadata {
  count: number;
  actions: AutonomyAction[];
}

// Mirrors the server's UNDO_GRACE_MS in agent-actions.ts. Kept in lockstep
// so the button hides client-side at the same instant the server starts
// rejecting the call (any drift here just means a brief "Undo failed"
// flash, which is recoverable).
const UNDO_GRACE_MS = 10 * 60 * 1000;

function isAutonomyMetadata(value: unknown): value is AutonomyMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as { count?: unknown; actions?: unknown };
  return typeof v.count === "number" && Array.isArray(v.actions);
}

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface QueueItem {
  id: number;
  kind: string;
  status: string;
  reason: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string | null;
  executedAt?: string | null;
  lastError?: string | null;
  lastErrorCode?: string | null;
}

const HISTORY_WINDOW_DAYS = 7;

// Mirrors RETRYABLE_ERROR_CODES in artifacts/api-server/src/lib/agent-actions.ts.
// Codes outside this set are permanent — Retry is hidden so users can't
// burn attempts on something that will never succeed.
const RETRYABLE_ERROR_CODES = new Set<string>(["rate_limited", "internal"]);

// Human-readable copy keyed by the coarse `lastErrorCode` the server
// stamps on a failed action row. Anything we don't recognise falls back
// to the truncated raw `lastError` so the user still sees *something*
// rather than a blank "Failed".
function errorReasonLabel(code: string | null | undefined, fallback: string | null | undefined): string | null {
  switch (code) {
    case "recipient_blocked":
      return "Recipient has blocked you — message can't be delivered.";
    case "recipient_not_found":
      return "Target user or post no longer exists.";
    case "content_rejected":
      return "Content was rejected (likely by moderation).";
    case "rate_limited":
      return "Hit a rate limit — will retry automatically.";
    case "unknown_kind":
      return "Action type isn't supported.";
    case "internal":
      return "Something went wrong on our side — will retry.";
    default:
      return fallback?.trim() ? fallback : null;
  }
}

type QueueStatus = "pending" | "queued" | "sent" | "posted" | "failed" | "gave_up" | "rejected";

// An approved row whose `executedAt` is still NULL is *probably* a failure
// (executeApprovedAction is synchronous on the approve path and resets the
// claim on throw), but for a brief window after approval it could also just
// be an in-flight execution whose response hasn't refreshed in our cache yet.
// Treat very-recent approvals as "Queued" rather than misclassifying them as
// "Failed" — the task description explicitly calls out not-yet-executed and
// failed as distinct states.
const FAILED_GRACE_MS = 30_000;

function deriveStatus(q: QueueItem): QueueStatus {
  if (q.status === "rejected") return "rejected";
  if (q.status === "pending") return "pending";
  // The background retry sweep flips a row to `status="failed"` once
  // MAX_ATTEMPTS is exhausted. Render it distinctly so the user sees
  // "Gave up" instead of an indefinite "Failed - Retry" loop.
  if (q.status === "failed") return "gave_up";
  // status === "approved"
  if (q.executedAt) {
    if (q.kind === "post" || q.kind === "comment") return "posted";
    return "sent";
  }
  const resolvedMs = q.resolvedAt ? new Date(q.resolvedAt).getTime() : 0;
  if (resolvedMs && Date.now() - resolvedMs < FAILED_GRACE_MS) return "queued";
  return "failed";
}

function statusBadgeClass(s: QueueStatus): string {
  switch (s) {
    case "sent":
    case "posted":
      return "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400";
    case "failed":
      return "bg-[#DC143C]/10 border border-[#DC143C]/40 text-[#DC143C]";
    case "gave_up":
      // Distinct from "failed" (transient): muted slate so the user sees
      // it's not asking them to retry endlessly, but still readable.
      return "bg-slate-500/10 border border-slate-500/40 text-slate-300";
    case "rejected":
      return "bg-white/5 border border-white/15 text-white/45";
    case "queued":
      return "bg-amber-500/10 border border-amber-500/30 text-amber-400";
    case "pending":
    default:
      return "bg-[#E8754A]/10 border border-[#E8754A]/30 text-[#E8754A]";
  }
}

function statusLabel(s: QueueStatus): string {
  switch (s) {
    case "sent": return "Sent";
    case "posted": return "Posted";
    case "failed": return "Needs retry";
    case "gave_up": return "Gave up";
    case "rejected": return "Rejected";
    case "queued": return "Queued";
    case "pending": return "Pending";
  }
}

export default function NotificationsPage() {
  const { data, refetch } = useListNotifications({}, {});
  const markAll = useMarkAllNotificationsRead();
  const [allQueue, setAllQueue] = useState<QueueItem[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [undoBusyId, setUndoBusyId] = useState<number | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  // Re-render every 30s so the per-entry Undo button auto-hides as it
  // ages out of the grace window without the user needing to refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const loadQueue = async () => {
    try {
      const r = await fetch(`${basePath()}/api/ai/soul-twin/agent/queue`);
      if (!r.ok) { setAllQueue([]); return; }
      const j = await r.json();
      const items: QueueItem[] = Array.isArray(j.actions) ? j.actions : Array.isArray(j.queue) ? j.queue : [];
      setAllQueue(items);
    } catch {
      setAllQueue([]);
    }
  };

  useEffect(() => { loadQueue(); }, []);

  const queue = useMemo(() => allQueue.filter((q) => q.status === "pending"), [allQueue]);
  const history = useMemo(() => {
    const cutoff = Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return allQueue
      .filter((q) => q.status !== "pending")
      .filter((q) => {
        const t = q.resolvedAt ?? q.createdAt;
        return t ? new Date(t).getTime() >= cutoff : true;
      });
  }, [allQueue]);
  const failedCount = useMemo(() => history.filter((q) => deriveStatus(q) === "failed").length, [history]);

  const handleMarkAll = async () => {
    await markAll.mutateAsync();
    refetch();
  };

  const resolveQueue = async (id: number, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(`${basePath()}/api/ai/soul-twin/agent/queue/${id}/${action}`, { method: "POST" });
      // Refresh from server so the row moves into the History tab with
      // an authoritative status (sent/posted/failed/rejected) instead of
      // disappearing from the UI.
      const updated: QueueItem | null = res.ok ? await res.json().catch(() => null) : null;
      if (updated && typeof updated.id === "number") {
        setAllQueue((q) => q.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      } else {
        await loadQueue();
      }
    } catch {
      // leave the row visible so the user can retry
    } finally {
      setBusyId(null);
    }
  };

  const retryQueue = async (id: number) => {
    setBusyId(id);
    setRetryError(null);
    try {
      const res = await fetch(`${basePath()}/api/ai/soul-twin/agent/queue/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setRetryError(typeof body?.error === "string" ? body.error : `Retry failed (${res.status})`);
        return;
      }
      const updated: QueueItem | null = await res.json().catch(() => null);
      if (updated && typeof updated.id === "number") {
        setAllQueue((q) => q.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      } else {
        await loadQueue();
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusyId(null);
    }
  };

  const undoExecuted = async (actionId: number) => {
    setUndoBusyId(actionId);
    setUndoError(null);
    try {
      const res = await fetch(`${basePath()}/api/ai/soul-twin/agent/executed/${actionId}/undo`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setUndoError(typeof body?.error === "string" ? body.error : `Undo failed (${res.status})`);
        return;
      }
      // Refetch the notifications list so the entry's `reverted` flag — set
      // server-side on the notification metadata — flows back into the UI
      // and the Undo button is replaced by the "Reverted" badge.
      await refetch();
      // Also reload the queue so the History tab can reflect the row's new
      // payload state for the same action.
      await loadQueue();
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setUndoBusyId(null);
    }
  };

  const queueLabel = (q: QueueItem) => {
    const target = (q.payload?.targetName as string) || (q.payload?.topic as string) || "";
    if (q.kind === "follow") return target ? `Follow ${target}` : "Follow suggestion";
    if (q.kind === "dm") return target ? `Send DM to ${target}` : "Send DM";
    if (q.kind === "post") return target ? `Publish post: ${target}` : "Publish drafted post";
    if (q.kind === "comment") return "Post comment";
    return q.kind;
  };

  return (
    <>
    <MobileFeedTopBar title="Notifications" />
    <div className="max-w-2xl mx-auto px-4 pt-[52px] lg:pt-6 pb-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1 lg:block hidden">Intel</div>
          <h1 className="text-2xl font-black uppercase tracking-tight hidden lg:block">Notifications</h1>
          {unreadCount > 0 && (
            <div className="text-[11px] text-[#DC143C] mt-0.5 font-black uppercase tracking-wider">{unreadCount} unread</div>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            size="sm"
            className="text-[11px] gap-1.5 bg-transparent border border-[#E8754A]/20 text-[#E8754A]/65 hover:border-[#E8754A]/45 hover:text-[#E8754A] font-black uppercase tracking-wider"
            onClick={handleMarkAll}
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark All Read
          </Button>
        )}
      </div>

      {(queue.length > 0 || history.length > 0) && (
        <div className="bg-black border border-[#E8754A]/15 mb-4">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E8754A]/10 bg-[#E8754A]/3">
            <Bot className="w-3.5 h-3.5 text-[#E8754A]" />
            <span className="text-[10px] text-[#E8754A] font-black uppercase tracking-[0.2em]">Soul Twin · Agent Queue</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={cn(
                  "h-6 px-2 text-[10px] font-black uppercase tracking-wider border",
                  tab === "pending"
                    ? "bg-[#E8754A]/15 border-[#E8754A]/40 text-[#E8754A]"
                    : "bg-transparent border-white/10 text-white/40 hover:text-white/70",
                )}
              >
                Pending {queue.length > 0 ? `(${queue.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className={cn(
                  "h-6 px-2 text-[10px] font-black uppercase tracking-wider border inline-flex items-center gap-1",
                  tab === "history"
                    ? "bg-[#E8754A]/15 border-[#E8754A]/40 text-[#E8754A]"
                    : "bg-transparent border-white/10 text-white/40 hover:text-white/70",
                )}
              >
                History {history.length > 0 ? `(${history.length})` : ""}
                {failedCount > 0 && (
                  <span className="inline-block w-1.5 h-1.5 bg-[#DC143C]" aria-label={`${failedCount} failed`} />
                )}
              </button>
            </div>
          </div>

          {tab === "pending" && (
            queue.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-white/35 font-medium">
                Nothing pending. The agent is quiet.
              </div>
            ) : (
              queue.map((q, i) => (
                <div
                  key={q.id}
                  className={cn(
                    "flex items-start gap-3 p-4",
                    i < queue.length - 1 && "border-b border-[#E8754A]/8",
                  )}
                >
                  <div className="w-9 h-9 shrink-0 border border-[#E8754A]/15 bg-[#E8754A]/5 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[#E8754A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white/85 font-medium">{queueLabel(q)}</p>
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 font-black uppercase tracking-wider",
                          statusBadgeClass("pending"),
                        )}
                      >
                        {statusLabel("pending")}
                      </span>
                    </div>
                    {q.reason && (
                      <p className="text-[11px] text-white/45 mt-0.5 font-medium">{q.reason}</p>
                    )}
                    <div className="text-[10px] text-white/25 mt-1 font-bold uppercase tracking-wider">
                      {q.createdAt ? formatDistanceToNow(new Date(q.createdAt), { addSuffix: true }) : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      disabled={busyId === q.id}
                      onClick={() => resolveQueue(q.id, "approve")}
                      className="h-7 px-2.5 gap-1 text-[10px] bg-[#E8754A]/10 hover:bg-[#E8754A]/20 border border-[#E8754A]/30 text-[#E8754A] font-black uppercase tracking-wider"
                    >
                      <Check className="w-3 h-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === q.id}
                      onClick={() => resolveQueue(q.id, "reject")}
                      className="h-7 px-2.5 gap-1 text-[10px] bg-transparent hover:bg-white/5 border border-white/15 text-white/55 font-black uppercase tracking-wider"
                    >
                      <X className="w-3 h-3" /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )
          )}

          {tab === "history" && (
            <>
              {retryError && (
                <div className="px-4 py-2 text-[11px] text-[#DC143C] border-b border-[#DC143C]/20 bg-[#DC143C]/5 font-medium">
                  {retryError}
                </div>
              )}
              {history.length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] text-white/35 font-medium">
                  No actions in the last {HISTORY_WINDOW_DAYS} days.
                </div>
              ) : (
                history.map((q, i) => {
                  const s = deriveStatus(q);
                  const ts = q.resolvedAt ?? q.createdAt;
                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "flex items-start gap-3 p-4",
                        i < history.length - 1 && "border-b border-[#E8754A]/8",
                      )}
                    >
                      <div className="w-9 h-9 shrink-0 border border-[#E8754A]/15 bg-[#E8754A]/5 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-[#E8754A]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-white/85 font-medium">{queueLabel(q)}</p>
                          <span
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 font-black uppercase tracking-wider",
                              statusBadgeClass(s),
                            )}
                            title={
                              s === "failed"
                                ? "Agent tried this but it didn't go through — open to retry."
                                : undefined
                            }
                          >
                            {statusLabel(s)}
                          </span>
                        </div>
                        {q.reason && (
                          <p className="text-[11px] text-white/45 mt-0.5 font-medium">{q.reason}</p>
                        )}
                        {(s === "failed" || s === "gave_up") && (() => {
                          const reason = errorReasonLabel(q.lastErrorCode, q.lastError);
                          if (reason) {
                            return (
                              <p className="text-[11px] text-[#DC143C]/85 mt-0.5 font-medium" title={q.lastError ?? undefined}>
                                {reason}
                              </p>
                            );
                          }
                          if (s === "failed") {
                            return (
                              <p className="text-[11px] text-[#DC143C]/85 mt-0.5 font-medium">
                                Agent tried this but it didn't go through — open to retry.
                              </p>
                            );
                          }
                          return null;
                        })()}
                        <div className="text-[10px] text-white/25 mt-1 font-bold uppercase tracking-wider">
                          {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : ""}
                        </div>
                      </div>
                      {s === "failed" && (q.lastErrorCode == null || RETRYABLE_ERROR_CODES.has(q.lastErrorCode)) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            disabled={busyId === q.id}
                            onClick={() => retryQueue(q.id)}
                            className="h-7 px-2.5 gap-1 text-[10px] bg-[#DC143C]/10 hover:bg-[#DC143C]/20 border border-[#DC143C]/40 text-[#DC143C] font-black uppercase tracking-wider"
                          >
                            <RefreshCw className={cn("w-3 h-3", busyId === q.id && "animate-spin")} /> Retry
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}

      <div className="bg-black border border-[#E8754A]/10">
        {notifications.length === 0 && (
          <div className="text-center py-16 text-white/25">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">All clear. Stay sharp.</p>
          </div>
        )}

        {notifications.map((n: any, i: number) => {
          const isAgent = n.type === "agent_executed";
          const autonomy = isAgent && isAutonomyMetadata(n.metadata) ? n.metadata : null;
          // Report-outcome notifications carry { reportedId, conversationId }
          // in metadata so we can deep-link the row back to the relevant
          // context. Prefer the conversation when present (the report was
          // about a DM exchange), otherwise fall back to the reported
          // user's profile. Anything else stays a plain row.
          const isReportOutcome =
            n.type === "report_actioned" || n.type === "report_dismissed";
          const reportMeta =
            isReportOutcome && n.metadata && typeof n.metadata === "object"
              ? (n.metadata as { reportedId?: string; conversationId?: number | null })
              : null;
          const reportLink = reportMeta
            ? reportMeta.conversationId
              ? `/messages?c=${reportMeta.conversationId}`
              : reportMeta.reportedId
                ? `/profile/${reportMeta.reportedId}`
                : null
            : null;
          // Chat-screenshot notifications carry { conversationId } in
          // metadata so the row deep-links to the affected DM thread.
          const isChatScreenshot = n.type === "chat_screenshot";
          const screenshotMeta =
            isChatScreenshot && n.metadata && typeof n.metadata === "object"
              ? (n.metadata as { conversationId?: number | null })
              : null;
          const screenshotLink = screenshotMeta?.conversationId
            ? `/messages?c=${screenshotMeta.conversationId}`
            : null;
          const deepLink = reportLink ?? screenshotLink;
          return (
          <div
            key={n.id}
            className={cn(
              "flex items-start gap-3 p-4 transition-colors hover:bg-[#E8754A]/2",
              i < notifications.length - 1 && "border-b border-[#E8754A]/8",
              !n.read && "border-l-2 border-l-[#DC143C] bg-[#DC143C]/3"
            )}
          >
            <div className="relative shrink-0">
              {isAgent ? (
                <div className="w-9 h-9 border border-[#E8754A]/15 bg-[#E8754A]/5 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-[#E8754A]" />
                </div>
              ) : (
                <Avatar className="w-9 h-9 border border-[#E8754A]/15">
                  <AvatarImage src={n.actorAvatar} />
                  <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{n.actorName?.[0] ?? "N"}</AvatarFallback>
                </Avatar>
              )}
              {!n.read && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#DC143C]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <span className="text-sm">{typeIcons[n.type] ?? "🔔"}</span>
                {deepLink ? (
                  <a
                    href={`${basePath()}${deepLink}`}
                    data-testid={`link-notification-${n.id}`}
                    className="text-sm flex-1 text-white/72 font-medium hover:text-[#E8754A] transition-colors underline-offset-2 hover:underline"
                  >
                    {n.message}
                  </a>
                ) : (
                  <p className="text-sm flex-1 text-white/72 font-medium">{n.message}</p>
                )}
              </div>
              {autonomy && autonomy.actions.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {autonomy.actions.map((a: AutonomyAction) => {
                    const executedMs = a.executedAt ? new Date(a.executedAt).getTime() : 0;
                    const ageMs = executedMs ? Date.now() - executedMs : Number.POSITIVE_INFINITY;
                    const undoable = !a.reverted && executedMs > 0 && ageMs < UNDO_GRACE_MS;
                    return (
                      <li key={a.actionId} className="text-[11px] text-white/55 font-medium flex items-center gap-2 flex-wrap">
                        <span className="text-[#E8754A]/70">·</span>
                        {a.reverted ? (
                          <span className="line-through text-white/35">{a.label}</span>
                        ) : a.link ? (
                          <a
                            href={`${basePath()}${a.link}`}
                            className="hover:text-[#E8754A] transition-colors underline-offset-2 hover:underline"
                          >
                            {a.label}
                          </a>
                        ) : (
                          <span>{a.label}</span>
                        )}
                        {a.reverted && (
                          <span className="text-[9px] px-1.5 py-0.5 font-black uppercase tracking-wider bg-white/5 border border-white/15 text-white/55">
                            Reverted
                          </span>
                        )}
                        {undoable && (
                          <button
                            type="button"
                            disabled={undoBusyId === a.actionId}
                            onClick={() => undoExecuted(a.actionId)}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 border border-[#DC143C]/40 bg-[#DC143C]/5 hover:bg-[#DC143C]/15 text-[#DC143C] uppercase tracking-wider font-black disabled:opacity-50"
                          >
                            <Undo2 className={cn("w-3 h-3", undoBusyId === a.actionId && "animate-pulse")} /> Undo
                          </button>
                        )}
                        {a.auditLink && (
                          <a
                            href={`${basePath()}${a.auditLink}`}
                            className="text-[10px] text-[#E8754A]/55 hover:text-[#E8754A] uppercase tracking-wider font-bold"
                          >
                            Audit
                          </a>
                        )}
                      </li>
                    );
                  })}
                  {undoError && (
                    <li className="text-[10px] text-[#DC143C] font-medium pl-3">{undoError}</li>
                  )}
                </ul>
              )}
              <div className="text-[10px] text-white/25 mt-1 font-bold uppercase tracking-wider">
                {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ""}
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </div>
    </>
  );
}
