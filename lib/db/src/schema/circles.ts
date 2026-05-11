import { pgTable, text, timestamp, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const circlesTable = pgTable("circles", {
  id: serial("id").primaryKey(),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  minPowerScore: integer("min_power_score").notNull().default(0),
  isInviteOnly: boolean("is_invite_only").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const circleMembersTable = pgTable("circle_members", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").notNull().references(() => circlesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const circlePostsTable = pgTable("circle_posts", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").notNull().references(() => circlesTable.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ghostViewsTable = pgTable("ghost_views", {
  id: serial("id").primaryKey(),
  targetId: text("target_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  viewerId: text("viewer_id").references(() => usersTable.id, { onDelete: "set null" }),
  isGhost: boolean("is_ghost").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCircleSchema = createInsertSchema(circlesTable).omit({ id: true, createdAt: true });
export type InsertCircle = z.infer<typeof insertCircleSchema>;
export type Circle = typeof circlesTable.$inferSelect;
export type CircleMember = typeof circleMembersTable.$inferSelect;
