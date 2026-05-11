import { Router } from "express";
import { db } from "@workspace/db";
import { communitiesTable, communityMembersTable, usersTable } from "@workspace/db";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListCommunitiesQueryParams,
  CreateCommunityBody,
  GetCommunityParams,
  JoinCommunityParams,
} from "@workspace/api-zod";
import { ensureUser, buildUserProfile } from "./users";

const router = Router();

async function buildCommunity(community: any, viewerClerkId?: string) {
  const creator = await db.query.usersTable.findFirst({ where: eq(usersTable.id, community.creatorId) });
  const creatorProfile = creator ? await buildUserProfile(creator, viewerClerkId) : null;
  const [members] = await db.select({ count: sql<number>`count(*)` }).from(communityMembersTable).where(eq(communityMembersTable.communityId, community.id));
  let isMember = false;
  if (viewerClerkId) {
    const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, viewerClerkId) });
    if (viewer) {
      const membership = await db.query.communityMembersTable.findFirst({ where: sql`${communityMembersTable.communityId} = ${community.id} AND ${communityMembersTable.userId} = ${viewer.id}` });
      isMember = !!membership;
    }
  }
  return { ...community, creator: creatorProfile, membersCount: Number(members?.count ?? 0), isMember };
}

router.get("/communities", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const query = ListCommunitiesQueryParams.safeParse(req.query);
  const q = query.success ? query.data.q : undefined;
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  let communities;
  if (q) {
    communities = await db.select().from(communitiesTable).where(ilike(communitiesTable.name, `%${q}%`)).orderBy(desc(communitiesTable.createdAt)).limit(limit);
  } else {
    communities = await db.select().from(communitiesTable).orderBy(desc(communitiesTable.createdAt)).limit(limit);
  }
  const enriched = await Promise.all(communities.map(c => buildCommunity(c, clerkId ?? undefined)));
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(communitiesTable);
  res.json({ communities: enriched, total: Number(total?.count ?? 0) });
});

router.post("/communities", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateCommunityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const { name, description, category, avatarUrl } = parsed.data;
  const [community] = await db.insert(communitiesTable).values({ creatorId: user.id, name, description, category, avatarUrl: avatarUrl ?? null }).returning();
  await db.insert(communityMembersTable).values({ communityId: community.id, userId: user.id });
  const enriched = await buildCommunity(community, clerkId);
  res.status(201).json(enriched);
});

router.get("/communities/:communityId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { communityId } = GetCommunityParams.parse(req.params);
  const community = await db.query.communitiesTable.findFirst({ where: eq(communitiesTable.id, Number(communityId)) });
  if (!community) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await buildCommunity(community, clerkId ?? undefined);
  res.json(enriched);
});

router.post("/communities/:communityId/join", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { communityId } = JoinCommunityParams.parse(req.params);
  const user = await ensureUser(clerkId);
  const existing = await db.query.communityMembersTable.findFirst({ where: sql`${communityMembersTable.communityId} = ${Number(communityId)} AND ${communityMembersTable.userId} = ${user.id}` });
  if (!existing) {
    await db.insert(communityMembersTable).values({ communityId: Number(communityId), userId: user.id });
  }
  const [members] = await db.select({ count: sql<number>`count(*)` }).from(communityMembersTable).where(eq(communityMembersTable.communityId, Number(communityId)));
  res.json({ joined: true, membersCount: Number(members?.count ?? 0) });
});

export default router;
