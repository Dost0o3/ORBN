import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import EventSource from "react-native-sse";
interface Breakdown {
  network: number;
  content: number;
  activity: number;
  reputation: number;
}

export interface PowerScoreLive {
  score: number;
  rank: string;
  breakdown: Breakdown;
  at: string;
}

import { API_BASE } from "../lib/api-base";

/**
 * Real-time stream of a user's power score for React Native, backed by the
 * server's SSE endpoint at `/api/users/:userId/power-score/stream`. Falls back
 * to a silent no-op on auth/network errors; the underlying EventSource will
 * automatically reconnect on transient failures.
 */
export function usePowerScoreStream(userId: string | undefined): { live: PowerScoreLive | null; pulse: number } {
  const { getToken } = useAuth();
  const [live, setLive] = useState<PowerScoreLive | null>(null);
  const [pulse, setPulse] = useState(0);
  const lastScoreRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let es: EventSource | null = null;

    (async () => {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        // ignore — endpoint requires auth, but we still attempt without
      }
      if (cancelled) return;

      try {
        es = new EventSource(`${API_BASE}/api/users/${userId}/power-score/stream`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
      } catch {
        return;
      }

      es.addEventListener("message", (ev: { data?: string | null }) => {
        if (cancelled || !ev?.data) return;
        try {
          const data = JSON.parse(ev.data);
          if (typeof data?.score === "number" && data?.rank) {
            const next: PowerScoreLive = {
              score: data.score,
              rank: data.rank,
              breakdown: data.breakdown,
              at: data.at ?? new Date().toISOString(),
            };
            setLive(next);
            if (lastScoreRef.current === null || next.score !== lastScoreRef.current) {
              setPulse((p) => p + 1);
            }
            lastScoreRef.current = next.score;
          }
        } catch {
          // ignore malformed payload
        }
      });

      es.addEventListener("error", () => {
        // react-native-sse auto-reconnects; nothing to do here.
      });
    })();

    return () => {
      cancelled = true;
      try {
        es?.removeAllEventListeners();
        es?.close();
      } catch {
        // ignore
      }
    };
  }, [userId, getToken]);

  return { live, pulse };
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export interface AchievementInfo {
  key: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export function useStreak(userId: string | undefined): StreakInfo | null {
  const { getToken } = useAuth();
  const [data, setData] = useState<StreakInfo | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/api/users/${userId}/streak`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [userId, getToken]);
  return data;
}

export function useAchievements(userId: string | undefined): AchievementInfo[] {
  const { getToken } = useAuth();
  const [data, setData] = useState<AchievementInfo[]>([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/api/users/${userId}/achievements`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setData(j.achievements ?? []);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [userId, getToken]);
  return data;
}
