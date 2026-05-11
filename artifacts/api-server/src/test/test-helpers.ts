import express, { type Express, type Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

export function makeApp(...routers: Router[]): Express {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use("/api", r);
  return app;
}

export interface CreateTestUserOpts {
  agentModeEnabled?: boolean;
  agentAutonomyEnabled?: boolean;
  agentConsentedAt?: Date | null;
  powerScoreCached?: number | null;
  powerRankCached?: string | null;
  powerScoreCachedAt?: Date | null;
  ghostMode?: boolean;
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  autonomyEmailEnabled?: boolean;
  autonomyPushEnabled?: boolean;
}

export type TestUser = typeof usersTable.$inferSelect;

export async function createTestUser(opts: CreateTestUserOpts = {}): Promise<TestUser> {
  const id = randomUUID();
  const clerkId = `tk_${id}`;
  const username = `tu_${id.replace(/-/g, "").slice(0, 16)}`;
  const [user] = await db.insert(usersTable).values({
    id,
    clerkId,
    username,
    displayName: opts.displayName ?? `Test User ${id.slice(0, 8)}`,
    skills: [],
    experience: [],
    agentModeEnabled: opts.agentModeEnabled ?? false,
    agentAutonomyEnabled: opts.agentAutonomyEnabled ?? false,
    agentConsentedAt: opts.agentConsentedAt ?? null,
    powerScoreCached: opts.powerScoreCached ?? null,
    powerRankCached: opts.powerRankCached ?? null,
    powerScoreCachedAt: opts.powerScoreCachedAt ?? null,
    ghostMode: opts.ghostMode ?? false,
    email: opts.email ?? null,
    phone: opts.phone ?? null,
    gender: opts.gender ?? null,
    autonomyEmailEnabled: opts.autonomyEmailEnabled ?? true,
    autonomyPushEnabled: opts.autonomyPushEnabled ?? true,
  }).returning();
  return user;
}

export async function deleteTestUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(usersTable).where(inArray(usersTable.id, ids)).catch(() => {});
}

export async function reloadUser(id: string): Promise<TestUser | undefined> {
  return db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
}

export async function waitForCondition(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
