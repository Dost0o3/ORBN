import { db, directBlocksTable, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

// Returns the set of user IDs that should be hidden from `clerkId`'s view of
// the network. Mutual: a user is hidden if the viewer blocked them OR if
// they blocked the viewer. Returns an empty array for unauthenticated
// viewers or viewers we can't resolve to a DB row.
//
// Centralized so feed, comments, search, suggestions, and profile-by-id
// routes all apply the same definition of "blocked" — see task #66.
export async function getHiddenAuthorIdsForViewer(
  clerkId: string | null | undefined,
): Promise<{ viewerId: string | null; hiddenAuthorIds: string[] }> {
  if (!clerkId) return { viewerId: null, hiddenAuthorIds: [] };
  const viewer = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkId, clerkId),
  });
  if (!viewer) return { viewerId: null, hiddenAuthorIds: [] };
  const rows = await db
    .select({
      blockerId: directBlocksTable.blockerId,
      blockedId: directBlocksTable.blockedId,
    })
    .from(directBlocksTable)
    .where(
      or(
        eq(directBlocksTable.blockerId, viewer.id),
        eq(directBlocksTable.blockedId, viewer.id),
      ),
    );
  const set = new Set<string>();
  for (const r of rows) {
    set.add(r.blockerId === viewer.id ? r.blockedId : r.blockerId);
  }
  return { viewerId: viewer.id, hiddenAuthorIds: [...set] };
}

// Convenience wrapper for routes that only need the ID list.
export async function getHiddenAuthorIds(
  clerkId: string | null | undefined,
): Promise<string[]> {
  const { hiddenAuthorIds } = await getHiddenAuthorIdsForViewer(clerkId);
  return hiddenAuthorIds;
}
