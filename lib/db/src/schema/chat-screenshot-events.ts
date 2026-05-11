import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { directConversationsTable } from "./direct-messages";

/**
 * One row per detected screenshot of a DM thread. The mobile client
 * (iOS/Android) reports these via `expo-screen-capture`'s screenshot
 * listener — browsers don't expose the event so web is out of scope.
 *
 * `screenshotterId` is the user who took the screenshot; `peerId` is
 * the other side of the thread (who gets notified). Both are derived
 * server-side from `conversationId` so a malicious client can't
 * pin a screenshot on someone else.
 *
 * The matching counter on `users.chat_screenshots_taken` is incremented
 * in the same transaction so the public profile badge stays in sync.
 */
export const chatScreenshotEventsTable = pgTable(
  "chat_screenshot_events",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => directConversationsTable.id, { onDelete: "cascade" }),
    screenshotterId: text("screenshotter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    peerId: text("peer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** "ios" | "android" — informational, sent by the client. */
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    screenshotterIdx: index("chat_screenshot_events_screenshotter_idx").on(t.screenshotterId),
    conversationIdx: index("chat_screenshot_events_conversation_idx").on(t.conversationId),
    // Composite indexes for the most common queries: a taker's recent
    // history and a peer's recent received-screenshots feed.
    takerCreatedIdx: index("chat_screenshot_events_taker_created_idx").on(
      t.screenshotterId,
      t.createdAt,
    ),
    peerCreatedIdx: index("chat_screenshot_events_peer_created_idx").on(
      t.peerId,
      t.createdAt,
    ),
  }),
);

export type ChatScreenshotEvent = typeof chatScreenshotEventsTable.$inferSelect;
