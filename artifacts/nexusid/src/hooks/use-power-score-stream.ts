import { useEffect, useRef, useState } from "react";

interface Breakdown {
  network: number;
  content: number;
  activity: number;
  reputation: number;
}

export interface PowerScoreEvent {
  score: number;
  rank: string;
  breakdown: Breakdown;
  at: string;
}

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/**
 * Subscribe to live power-score updates for a given user via SSE.
 * Falls back gracefully on disconnect; does not throw on auth failures.
 */
export function usePowerScoreStream(userId: string | undefined): { live: PowerScoreEvent | null; pulse: number } {
  const [live, setLive] = useState<PowerScoreEvent | null>(null);
  const [pulse, setPulse] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!userId) return;
    const url = `${basePath()}/api/users/${userId}/power-score/stream`;
    let cancelled = false;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url, { withCredentials: true } as EventSourceInit);
    } catch {
      return;
    }
    sourceRef.current = es;
    es.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(ev.data);
        if (data?.score !== undefined && data?.rank !== undefined) {
          setLive({ score: data.score, rank: data.rank, breakdown: data.breakdown, at: data.at });
          setPulse((p) => p + 1);
        }
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
    return () => {
      cancelled = true;
      es?.close();
      sourceRef.current = null;
    };
  }, [userId]);

  return { live, pulse };
}
