import { pgTable, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  location: text("location"),
  website: text("website"),
  occupation: text("occupation"),
  gender: text("gender"),
  phone: text("phone"),
  email: text("email"),
  skills: text("skills").array().notNull().default([]),
  experience: jsonb("experience").notNull().default([]),
  didDocument: jsonb("did_document"),
  ghostMode: boolean("ghost_mode").notNull().default(false),
  agentModeEnabled: boolean("agent_mode_enabled").notNull().default(false),
  agentAutonomyEnabled: boolean("agent_autonomy_enabled").notNull().default(false),
  agentConsentedAt: timestamp("agent_consented_at"),
  /**
   * Out-of-band heads-up when the autonomy path acts on the user's
   * behalf. Default true so the user is opted in by default — the
   * Settings page lets them turn it off if they don't want the email.
   * Bundled via the same 5-minute window as the in-app notification so
   * a busy autonomy run doesn't trigger a flood of emails.
   */
  autonomyEmailEnabled: boolean("autonomy_email_enabled").notNull().default(true),
  /**
   * Same opt-out for native push when the user has the mobile app
   * signed in (i.e. has at least one registered device push token).
   */
  autonomyPushEnabled: boolean("autonomy_push_enabled").notNull().default(true),
  /**
   * When true (default), the server publishes a `read` SSE event when
   * this user opens a thread and exposes the resulting `readAt` to the
   * peer on subsequent message fetches. When false, the user is invisible
   * to read receipts: incoming messages are still flagged readAt locally
   * so their unread badge clears, but no SSE goes out and `readAt` is
   * scrubbed from API responses bound for the peer. Symmetric — a user
   * who hides their own receipts also can't see other people's, matching
   * the standard messaging-app pattern.
   */
  readReceiptsEnabled: boolean("read_receipts_enabled").notNull().default(true),
  powerScoreCached: integer("power_score_cached"),
  powerRankCached: text("power_rank_cached"),
  powerScoreCachedAt: timestamp("power_score_cached_at"),
  usernameChangedAt: timestamp("username_changed_at"),
  lastSeenAt: timestamp("last_seen_at"),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Identity-verification tier shown next to the user's name as a check
  // mark badge. Stored as a free-form text column (rather than a pg enum)
  // so future tiers (e.g. "gold") can be added by an admin without a
  // migration. Allowed values today: "silver" (identity verified) and
  // "blue" (notable / premium). NULL means unverified.
  verificationTier: text("verification_tier"),
  /**
   * Public counter of how many times this user has screenshotted a DM
   * thread (across all peers). Surfaced on the profile as a "screenshots
   * taken" warning chip so others can decide whether to share sensitive
   * messages with them. Maintained in the same DB transaction that
   * inserts the corresponding row in `chat_screenshot_events`.
   */
  chatScreenshotsTaken: integer("chat_screenshots_taken").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const followsTable = pgTable("follows", {
  followerId: text("follower_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  followingId: text("following_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
