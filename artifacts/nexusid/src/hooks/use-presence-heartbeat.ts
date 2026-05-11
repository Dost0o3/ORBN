import { useEffect } from "react";

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/**
 * How long with zero user input before we treat the tab as idle and stop
 * pinging presence. 5 minutes matches the common "afk" threshold most
 * chat apps use — short enough that the green dot stays meaningful, long
 * enough that briefly switching windows or reading a long thread doesn't
 * flicker the dot off.
 */
const IDLE_THRESHOLD_MS = 5 * 60_000;

/** Heartbeat cadence. Kept at 30s to match the 75s freshness window in `isOnline`. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Periodically tells the server "I'm still here" so peers see an online dot
 * next to our name in their DM list. Skips while the tab is hidden, and
 * also pauses after IDLE_THRESHOLD_MS of no mouse/keyboard/touch/focus
 * activity so a tab left open in the background doesn't keep the dot on
 * forever. Any input immediately resumes pinging on the next interval
 * tick (and fires an extra ping right away so peers see us light back up
 * without waiting up to 30s).
 */
export function usePresenceHeartbeat(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let lastActivityAt = Date.now();

    const isIdle = () => Date.now() - lastActivityAt > IDLE_THRESHOLD_MS;

    const ping = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (isIdle()) return;
      fetch(`${basePath()}/api/users/me/heartbeat`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        /* presence is best-effort */
      });
    };

    const onActivity = () => {
      // Wake-from-idle case: if the user comes back after the threshold,
      // fire an immediate heartbeat so the dot relights right away
      // instead of waiting up to HEARTBEAT_INTERVAL_MS for the next tick.
      const wasIdle = isIdle();
      lastActivityAt = Date.now();
      if (wasIdle) ping();
    };

    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) {
        // Visibility-change counts as activity — the user just looked at
        // the tab, so reset the idle timer. Then always fire an immediate
        // ping to preserve the pre-idle behaviour where briefly hidden
        // tabs relit the dot the moment they came back; without the
        // unconditional ping a tab hidden for <5min would silently wait
        // up to 30s for the next interval tick.
        lastActivityAt = Date.now();
        ping();
      }
    };

    // Listen on `window` (passive where it matters) so we catch input
    // anywhere in the app without each component having to opt in.
    // `pointermove` covers mouse + pen + touch; `keydown` covers
    // keyboard; `focus`/`scroll`/`touchstart` round out the corners
    // (e.g. mobile users tapping without firing pointermove).
    const activityEvents = [
      "pointermove",
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
      "focus",
    ] as const;
    for (const ev of activityEvents) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      for (const ev of activityEvents) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}

/** True when `lastSeenAt` is within the freshness window (default 75s). */
export function isOnline(
  lastSeenAt: string | null | undefined,
  thresholdMs: number = 75_000,
): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < thresholdMs;
}
