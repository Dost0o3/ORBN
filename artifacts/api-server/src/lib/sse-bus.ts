import type { Response } from "express";
import { logger } from "./logger";

type Channel = "power-score" | "achievements" | "streak" | "dm-inbox" | "feed";

export type DmExpiredEvent = {
  type: "expired";
  conversationId: number;
  messageId: number;
  at: string;
};

// Emitted on the dm-inbox channel when a Soul Twin DM is undone within
// the 10-minute grace window. Distinct from "expired" (which means the
// TTL elapsed) so the recipient's open thread can render a different
// placeholder ("Message was unsent" vs "self-destructed").
export type DmUnsentEvent = {
  type: "unsent";
  conversationId: number;
  messageId: number;
  at: string;
};

// Emitted on the per-user `feed` channel when something the user is
// currently viewing in their feed disappears server-side, so an open
// post card / comment list can drop the row without waiting for a
// refetch. Currently only fired by the Soul Twin comment-undo path,
// but the channel is intentionally generic.
export type FeedEvent =
  | {
      type: "comment-removed";
      postId: number;
      commentId: number;
      at: string;
    };
type Subscriber = { res: Response; userId: string };

const subscribers = new Map<string, Set<Subscriber>>();

function key(channel: Channel, userId: string): string {
  return `${channel}:${userId}`;
}

export function subscribe(channel: Channel, userId: string, res: Response): () => void {
  const k = key(channel, userId);
  let set = subscribers.get(k);
  if (!set) {
    set = new Set();
    subscribers.set(k, set);
  }
  const sub: Subscriber = { res, userId };
  set.add(sub);
  return () => {
    const cur = subscribers.get(k);
    if (cur) {
      cur.delete(sub);
      if (cur.size === 0) subscribers.delete(k);
    }
  };
}

export function publish(channel: Channel, userId: string, payload: unknown): void {
  const set = subscribers.get(key(channel, userId));
  if (!set || set.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const sub of set) {
    try {
      sub.res.write(data);
    } catch (err) {
      logger.warn({ err, channel, userId }, "sse-bus: write failed");
    }
  }
}
