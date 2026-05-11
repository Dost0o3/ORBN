import { pgTable, text, timestamp, serial, integer, jsonb, date, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const powerScoreSnapshotsTable = pgTable("power_score_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  rank: text("rank").notNull(),
  breakdown: jsonb("breakdown").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userTimeIdx: index("power_score_snapshots_user_time_idx").on(t.userId, t.createdAt),
}));

export const dailyStreaksTable = pgTable("daily_streaks", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const achievementsTable = pgTable("achievements", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon"),
  awardedAt: timestamp("awarded_at").notNull().defaultNow(),
}, (t) => ({
  unq: unique("achievements_user_code_unq").on(t.userId, t.code),
}));

export const endorsementsTable = pgTable("endorsements", {
  id: serial("id").primaryKey(),
  endorserId: text("endorser_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  endorseeId: text("endorsee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  skill: text("skill").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  unq: unique("endorsements_unq").on(t.endorserId, t.endorseeId, t.skill),
}));

export type PowerScoreSnapshot = typeof powerScoreSnapshotsTable.$inferSelect;
export type DailyStreak = typeof dailyStreaksTable.$inferSelect;
export type Achievement = typeof achievementsTable.$inferSelect;
export type Endorsement = typeof endorsementsTable.$inferSelect;
