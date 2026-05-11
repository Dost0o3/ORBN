import { useEffect, useRef } from "react";

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export type FeedStreamEvent =
  | {
      type: "comment-removed";
      postId: number;
      commentId: number;
      at: string;
    }
  | { type: "ready"; at: string };

/**
 * Subscribe to the current user's feed-level SSE channel. Currently only
 * fires "comment-removed" when a Soul Twin comment-undo lands server-side,
 * so an open feed view can drop the row immediately without waiting for
 * the next comments refetch. Mirrors useDmInboxStream's shape.
 */
export function useFeedStream(
  enabled: boolean,
  onEvent: (ev: FeedStreamEvent) => void,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const url = `${basePath()}/api/feed/stream`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url, { withCredentials: true } as EventSourceInit);
    } catch {
      return;
    }
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as FeedStreamEvent;
        handlerRef.current(data);
      } catch {
        /* ignore malformed payloads */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects with backoff.
    };
    return () => {
      es?.close();
    };
  }, [enabled]);
}
