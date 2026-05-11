import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Native push tokens registered by signed-in mobile clients (Expo).
 * Used by the autonomy notification path so that, when Soul Twin acts
 * on the user's behalf and they're not actively in the web app, we can
 * still get an immediate heads-up to their phone.
 *
 * The token itself is the primary key (i.e. globally unique) — a
 * physical device only has one Expo push token at a time, so an
 * incoming registration with an existing token must atomically
 * reassign ownership to the new user (e.g. account switch on the
 * same device). Keying on (userId, token) instead would let two
 * users coexist as owners of the same token, which would deliver one
 * user's autonomy heads-ups to another user's device — a cross-account
 * disclosure bug. We avoid that by enforcing global uniqueness here.
 */
export const devicePushTokensTable = pgTable("device_push_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** "ios" | "android" | "web" — informational, not load-bearing today. */
  platform: text("platform"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DevicePushToken = typeof devicePushTokensTable.$inferSelect;
