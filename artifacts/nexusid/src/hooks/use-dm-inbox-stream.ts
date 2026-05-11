import { useEffect, useRef } from "react";

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export type DmInboxEvent =
  | {
      type: "message";
      message: {
        id: number;
        conversationId: number;
        senderId: string;
        recipientId: string;
        content: string;
        createdAt: string;
        expiresAt: string | null;
        readAt: string | null;
      };
    }
  | { type: "typing"; fromUserId: string; at: string }
  | {
      type: "read";
      conversationId: number;
      readerId: string;
      messageIds: number[];
      at: string;
    }
  | {
      type: "expired";
      conversationId: number;
      messageId: number;
      at: string;
    }
  | {
      // Emitted when a Soul Twin DM is undone within the 10-minute grace
      // window. Distinct from "expired" (TTL hit) so the open thread can
      // render a different placeholder ("Message was unsent").
      type: "unsent";
      conversationId: number;
      messageId: number;
      at: string;
    }
  | { type: "ready"; at: string };

/**
 * Subscribe to the current user's direct-message inbox over SSE. The stream
 * delivers both incoming messages and typing pings from peers, replacing the
 * old 5-second poll loop.
 */
export function useDmInboxStream(
  enabled: boolean,
  onEvent: (ev: DmInboxEvent) => void,
): void {
  // Keep a ref so the EventSource doesn't tear down every time the parent
  // re-renders with a new closure.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const url = `${basePath()}/api/messages/stream`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url, { withCredentials: true } as EventSourceInit);
    } catch {
      return;
    }
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as DmInboxEvent;
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
