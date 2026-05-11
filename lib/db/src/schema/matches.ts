import { pgTable, text, timestamp, serial, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const matchSwipesTable = pgTable("match_swipes", {
  id: serial("id").primaryKey(),
  swiperId: text("swiper_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  targetId: text("target_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  swiperTargetUnique: uniqueIndex("match_swipes_swiper_target_idx").on(table.swiperId, table.targetId),
  targetIdx: index("match_swipes_target_idx").on(table.targetId),
}));

export type MatchSwipe = typeof matchSwipesTable.$inferSelect;
export type InsertMatchSwipe = typeof matchSwipesTable.$inferInsert;
