import { pgTable, text, timestamp, serial, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const bountiesTable = pgTable("bounties", {
  id: serial("id").primaryKey(),
  posterId: text("poster_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  reward: text("reward").notNull(),
  deadline: text("deadline"),
  status: text("status").notNull().default("open"),
  winnerId: text("winner_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bountySubmissionsTable = pgTable("bounty_submissions", {
  id: serial("id").primaryKey(),
  bountyId: integer("bounty_id").notNull().references(() => bountiesTable.id, { onDelete: "cascade" }),
  submitterId: text("submitter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  link: text("link"),
  isWinner: boolean("is_winner").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBountySchema = createInsertSchema(bountiesTable).omit({ id: true, createdAt: true });
export const insertBountySubmissionSchema = createInsertSchema(bountySubmissionsTable).omit({ id: true, createdAt: true });
export type InsertBounty = z.infer<typeof insertBountySchema>;
export type Bounty = typeof bountiesTable.$inferSelect;
export type BountySubmission = typeof bountySubmissionsTable.$inferSelect;
