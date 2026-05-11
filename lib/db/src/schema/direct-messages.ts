import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// One row per pair of users that have ever DM'd each other.
// `user1Id` is always the lexicographically-smaller id so the pair is unique.
export const directConversationsTable = pgTable(
  "direct_conversations",
  {
    id: serial("id").primaryKey(),
    user1Id: text("user1_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    user2Id: text("user2_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pairUnique: uniqueIndex("direct_conversations_pair_unique").on(
      t.user1Id,
      t.user2Id,
    ),
    user1Idx: index("direct_conversations_user1_idx").on(t.user1Id),
    user2Idx: index("direct_conversations_user2_idx").on(t.user2Id),
  }),
);

export const directMessagesTable = pgTable(
  "direct_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => directConversationsTable.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    // When set, the message becomes invisible (and is excluded from queries)
    // after this time. Powers the "self-destructing" option.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    conversationIdx: index("direct_messages_conversation_idx").on(
      t.conversationId,
    ),
    recipientUnreadIdx: index("direct_messages_recipient_unread_idx").on(
      t.recipientId,
      t.readAt,
    ),
  }),
);

// One row per (blocker → blocked) pair. The blocked user can no longer send
// DMs to the blocker, and existing conversations are hidden from the blocker's
// inbox. Blocks are one-directional; both users may block each other.
export const directBlocksTable = pgTable(
  "direct_blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: text("blocker_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pairUnique: uniqueIndex("direct_blocks_pair_unique").on(
      t.blockerId,
      t.blockedId,
    ),
    blockerIdx: index("direct_blocks_blocker_idx").on(t.blockerId),
    blockedIdx: index("direct_blocks_blocked_idx").on(t.blockedId),
  }),
);

// Moderation reports filed against a user, with optional reason. Stored for
// later review; no automatic action is taken beyond the accompanying block.
export const userReportsTable = pgTable(
  "user_reports",
  {
    id: serial("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reportedId: text("reported_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    conversationId: integer("conversation_id").references(
      () => directConversationsTable.id,
      { onDelete: "set null" },
    ),
    reason: text("reason"),
    // pending | reviewed | dismissed | actioned
    status: text("status").notNull().default("pending"),
    reviewedById: text("reviewed_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    reportedIdx: index("user_reports_reported_idx").on(t.reportedId),
    reporterIdx: index("user_reports_reporter_idx").on(t.reporterId),
    statusIdx: index("user_reports_status_idx").on(t.status),
  }),
);

export const insertDirectConversationSchema = createInsertSchema(
  directConversationsTable,
).omit({ id: true, createdAt: true, lastMessageAt: true });

export const insertDirectMessageSchema = createInsertSchema(
  directMessagesTable,
).omit({ id: true, createdAt: true, readAt: true });

export type DirectConversation = typeof directConversationsTable.$inferSelect;
export type InsertDirectConversation = z.infer<
  typeof insertDirectConversationSchema
>;
export type DirectMessage = typeof directMessagesTable.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;
