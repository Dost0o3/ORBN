import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type ConsentCheck =
  | { ok: true }
  | { ok: false; status: 403; error: string };

export async function requireAgentConsent(userId: string): Promise<ConsentCheck> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { agentModeEnabled: true, agentConsentedAt: true },
  });
  if (!user) return { ok: false, status: 403, error: "User not found" };
  if (!user.agentConsentedAt) {
    return { ok: false, status: 403, error: "Agent Mode consent required. Toggle Agent Mode on with consent first." };
  }
  if (!user.agentModeEnabled) {
    return { ok: false, status: 403, error: "Agent Mode is off. Turn Agent Mode on first." };
  }
  return { ok: true };
}
