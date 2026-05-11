import { pgTable, text, timestamp, serial, jsonb, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userStyleProfilesTable = pgTable("user_style_profiles", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  tone: text("tone"),
  cadence: text("cadence"),
  emojis: text("emojis").array().notNull().default([]),
  openers: text("openers").array().notNull().default([]),
  closers: text("closers").array().notNull().default([]),
  topics: text("topics").array().notNull().default([]),
  doNots: text("do_nots").array().notNull().default([]),
  sample: text("sample"),
  postsAnalyzed: integer("posts_analyzed").notNull().default(0),
  refreshedAt: timestamp("refreshed_at").notNull().defaultNow(),
});

export const soulTwinActionsTable = pgTable("soul_twin_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  targetUserId: text("target_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  targetPostId: integer("target_post_id"),
  payload: jsonb("payload").notNull().default({}),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  // Set the moment the side-effect (DM/post/comment/follow) actually ran.
  // Distinct from `resolvedAt` so we can tell a "merely approved" row apart
  // from one whose real-world action succeeded — the column doubles as the
  // audit-log timestamp for autonomy-mode executions.
  executedAt: timestamp("executed_at"),
  // Number of times executeApprovedAction has tried to run this row's
  // side effect (incremented on the atomic claim). Used by the background
  // retry sweep to back off and to give up after a fixed cap so a
  // permanently-broken row doesn't loop forever.
  attemptCount: integer("attempt_count").notNull().default(0),
  // Timestamp of the most recent execution attempt. Used together with
  // attemptCount to schedule the next retry.
  lastAttemptAt: timestamp("last_attempt_at"),
  // Last execution error message (truncated server-side). Surfaced to the
  // client so the user can tell why a failed/given-up action didn't go
  // through.
  lastError: text("last_error"),
  // Coarse-grained classification of the last error so the client can
  // render a human-readable reason and decide whether Retry is worth
  // showing. Values are produced by classifyExecutionError() in
  // agent-actions.ts: "recipient_blocked", "content_rejected",
  // "recipient_not_found", "rate_limited", "unknown_kind", "internal".
  // NULL when the row has never failed.
  lastErrorCode: text("last_error_code"),
}, (t) => ({
  userIdx: index("soul_twin_actions_user_idx").on(t.userId, t.status),
  // Supports the agent-retry background sweep, which scans for
  // approved + unexecuted rows whose attemptCount hasn't hit MAX_ATTEMPTS
  // every minute. Without this index the worker would degrade to a full
  // table scan once history grows.
  retryIdx: index("soul_twin_actions_retry_idx").on(t.status, t.executedAt, t.attemptCount),
}));

export const soulTwinOpportunitiesTable = pgTable("soul_twin_opportunities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  cta: text("cta"),
  ctaUrl: text("cta_url"),
  payload: jsonb("payload").notNull().default({}),
  score: integer("score").notNull().default(0),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("soul_twin_opportunities_user_idx").on(t.userId, t.status),
}));

// DB-backed daily rate-limit counters used by the Soul Twin agent endpoints.
// Survives api-server restarts so the daily cap can't be reset by a deploy.
export const agentRateLimitsTable = pgTable("agent_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().defaultNow(),
});

export type SoulTwinAction = typeof soulTwinActionsTable.$inferSelect;
export type SoulTwinOpportunity = typeof soulTwinOpportunitiesTable.$inferSelect;
export type UserStyleProfile = typeof userStyleProfilesTable.$inferSelect;
export type AgentRateLimit = typeof agentRateLimitsTable.$inferSelect;
