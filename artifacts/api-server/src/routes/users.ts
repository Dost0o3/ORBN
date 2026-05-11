import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, followsTable, postsTable, likesTable, commentsTable, bountiesTable, bountySubmissionsTable, ghostViewsTable, endorsementsTable, devicePushTokensTable } from "@workspace/db";
import { eq, and, ilike, or, sql, inArray, notInArray } from "drizzle-orm";
import { getHiddenAuthorIds } from "../lib/blocks";
import { getAuth, clerkClient } from "@clerk/express";
import {
  UpdateMeBody,
  SearchUsersQueryParams,
  GetUserByIdParams,
  GetUserPostsParams,
  GetUserPostsQueryParams,
  FollowUserParams,
  UnfollowUserParams,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { getPowerScore, getBatchPowerScores, recomputePowerScore } from "../lib/power-score";
import { updateStreak, getStreak } from "../lib/streaks";
import { evaluateAchievements, listAchievements } from "../lib/achievements";
import { subscribe } from "../lib/sse-bus";

export { getPowerScore, getBatchPowerScores };


const router = Router();

function generateUsername(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `user_${suffix}`;
}

/** Fetch the user's public profile from Clerk — name, avatar, primary email. */
async function fetchClerkProfile(clerkId: string): Promise<{ displayName: string | null; avatarUrl: string | null; email: string | null }> {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const firstName = clerkUser.firstName?.trim() ?? "";
    const lastName = clerkUser.lastName?.trim() ?? "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || clerkUser.username || null;
    const avatarUrl = clerkUser.imageUrl || null;
    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? null;
    return { displayName, avatarUrl, email };
  } catch {
    return { displayName: null, avatarUrl: null, email: null };
  }
}

async function ensureUser(clerkId: string) {
  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });

  if (!user) {
    // Brand new user — generate a unique username and pull real name/avatar from Clerk
    let username = generateUsername();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.username, username) });
      if (!existing) break;
      username = generateUsername();
      attempts++;
    }
    const { displayName: clerkDisplayName, avatarUrl: clerkAvatarUrl, email: clerkEmail } = await fetchClerkProfile(clerkId);
    const id = randomUUID();
    const [created] = await db
      .insert(usersTable)
      .values({
        id,
        clerkId,
        username,
        displayName: clerkDisplayName ?? username,
        avatarUrl: clerkAvatarUrl,
        email: clerkEmail,
        skills: [],
        experience: [],
      })
      .returning();
    user = created;
  } else if (!user.displayName || user.displayName === user.username) {
    // Existing user whose display name is still the auto-generated placeholder —
    // sync their real name and avatar from Clerk so the profile looks complete.
    const { displayName: clerkDisplayName, avatarUrl: clerkAvatarUrl } = await fetchClerkProfile(clerkId);
    if (clerkDisplayName || clerkAvatarUrl) {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (clerkDisplayName) updates.displayName = clerkDisplayName;
      if (clerkAvatarUrl && !user.avatarUrl) updates.avatarUrl = clerkAvatarUrl;
      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();
      user = updated;
    }
  }

  return user;
}

type UserRow = typeof usersTable.$inferSelect;

async function buildUserProfile(user: UserRow, viewerClerkId?: string) {
  const [followers, following, posts] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followingId, user.id)),
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followerId, user.id)),
    db.select({ count: sql<number>`count(*)` }).from(postsTable).where(eq(postsTable.authorId, user.id)),
  ]);
  let isFollowing = false;
  if (viewerClerkId && viewerClerkId !== user.clerkId) {
    const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, viewerClerkId) });
    if (viewer) {
      const follow = await db.query.followsTable.findFirst({ where: and(eq(followsTable.followerId, viewer.id), eq(followsTable.followingId, user.id)) });
      isFollowing = !!follow;
    }
  }
  const [bountiesWonRow] = await db.select({ count: sql<number>`count(*)` })
    .from(bountySubmissionsTable)
    .where(and(eq(bountySubmissionsTable.submitterId, user.id), eq(bountySubmissionsTable.isWinner, true)));
  const bountiesWon = Number(bountiesWonRow?.count ?? 0);
  const isSelf = !!viewerClerkId && viewerClerkId === user.clerkId;
  const sanitized = { ...user };
  if (!isSelf) {
    sanitized.phone = null;
    sanitized.gender = null;
    sanitized.email = null;
  }
  return {
    ...sanitized,
    followersCount: Number(followers[0]?.count ?? 0),
    followingCount: Number(following[0]?.count ?? 0),
    postsCount: Number(posts[0]?.count ?? 0),
    isFollowing,
    bountiesWon,
    experience: Array.isArray(user.experience) ? user.experience : [],
    skills: Array.isArray(user.skills) ? user.skills : [],
    lastSeenAt: user.lastSeenAt ?? null,
    chatScreenshotsTaken: user.chatScreenshotsTaken ?? 0,
  };
}

router.get("/users/by-username/:username", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const username = String(req.params.username ?? "").trim().toLowerCase();
  if (!username) { res.status(400).json({ error: "username required" }); return; }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.username, username) });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  // Mutual block hiding — match the by-id endpoint so the username route
  // can't be used as a side-channel to peek at a blocked profile.
  const hidden = await getHiddenAuthorIds(clerkId);
  if (hidden.includes(user.id)) { res.status(404).json({ error: "Not found" }); return; }
  const profile = await buildUserProfile(user, clerkId ?? undefined);
  res.json(profile);
});

router.get("/users/me", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const profile = await buildUserProfile(user, clerkId);
  res.json(profile);
});

router.put("/users/me", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const { username, ...rest } = parsed.data as typeof parsed.data & { username?: string };

  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };

  // Treat explicit null OR empty string as "clear this field" for avatar/cover
  // so the profile reverts to the default fallback look.
  if ("avatarUrl" in rest) {
    updateData.avatarUrl = rest.avatarUrl === "" || rest.avatarUrl == null ? null : rest.avatarUrl;
  }
  if ("coverUrl" in rest) {
    updateData.coverUrl = rest.coverUrl === "" || rest.coverUrl == null ? null : rest.coverUrl;
  }

  if (username !== undefined && username !== user.username) {
    const usernameRe = /^[a-z0-9_]{3,30}$/;
    if (!usernameRe.test(username)) {
      res.status(400).json({ error: "Username must be 3-30 characters, lowercase letters, numbers, and underscores only." });
      return;
    }
    const taken = await db.query.usersTable.findFirst({ where: eq(usersTable.username, username) });
    if (taken) {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    if (user.usernameChangedAt) {
      const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000;
      const nextAllowed = new Date(user.usernameChangedAt.getTime() + sixMonthsMs);
      if (new Date() < nextAllowed) {
        res.status(429).json({ error: `You can next change your username on ${nextAllowed.toLocaleDateString()}.`, nextAllowed: nextAllowed.toISOString() });
        return;
      }
    }
    updateData.username = username;
    updateData.usernameChangedAt = new Date();
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, user.id)).returning();
  const profile = await buildUserProfile(updated, clerkId);
  res.json(profile);
});

async function computeUserStats(userId: string) {
  const [followers, following, posts, likesReceived, commentsReceived, bountiesWon] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followingId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followerId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(postsTable).where(eq(postsTable.authorId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(likesTable).where(
      sql`${likesTable.postId} IN (SELECT id FROM posts WHERE author_id = ${userId})`
    ),
    db.select({ count: sql<number>`count(*)` }).from(commentsTable).where(
      sql`${commentsTable.postId} IN (SELECT id FROM posts WHERE author_id = ${userId})`
    ),
    db.select({ count: sql<number>`count(*)` }).from(bountySubmissionsTable).where(
      and(eq(bountySubmissionsTable.submitterId, userId), eq(bountySubmissionsTable.isWinner, true))
    ),
  ]);
  return {
    followersCount: Number(followers[0]?.count ?? 0),
    followingCount: Number(following[0]?.count ?? 0),
    postsCount: Number(posts[0]?.count ?? 0),
    likesReceived: Number(likesReceived[0]?.count ?? 0),
    commentsReceived: Number(commentsReceived[0]?.count ?? 0),
    bountiesWon: Number(bountiesWon[0]?.count ?? 0),
  };
}

router.get("/users/stats", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  res.json(await computeUserStats(user.id));
});

router.get("/users/:userId/stats", async (req, res): Promise<void> => {
  const { userId } = GetUserByIdParams.parse(req.params);
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await computeUserStats(user.id));
});

router.get("/users/search", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const parsed = SearchUsersQueryParams.safeParse(req.query);
  const q = parsed.success ? parsed.data.q : "";
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const offset = parsed.success ? (parsed.data.offset ?? 0) : 0;
  // Mutual block hiding — see lib/blocks.ts. A user appears in search only
  // if neither side has blocked the other.
  const hidden = await getHiddenAuthorIds(clerkId);
  const hiddenFilter = hidden.length > 0 ? notInArray(usersTable.id, hidden) : undefined;
  const matchFilter = q
    ? or(ilike(usersTable.username, `%${q}%`), ilike(usersTable.displayName, `%${q}%`))
    : undefined;
  const whereClause = matchFilter && hiddenFilter
    ? and(matchFilter, hiddenFilter)
    : (matchFilter ?? hiddenFilter);
  const users = await db.select().from(usersTable).where(whereClause).limit(limit).offset(offset);
  const [profiles, powerScores] = await Promise.all([
    Promise.all(users.map(u => buildUserProfile(u, clerkId ?? undefined))),
    getBatchPowerScores(users.map(u => u.id)),
  ]);
  const profilesWithPower = profiles.map(p => ({
    ...p,
    powerScore: powerScores.get(p.id)?.score ?? null,
    powerRank: powerScores.get(p.id)?.rank ?? null,
  }));
  res.json({ users: profilesWithPower, total: profilesWithPower.length });
});

router.get("/users/:userId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { userId } = GetUserByIdParams.parse(req.params);
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  // If either side has blocked the other, hide this profile from the API
  // surface (404, not 403, to match listing behaviour and avoid leaking
  // the relationship). The viewer's own profile is never blocked from
  // themselves.
  const hidden = await getHiddenAuthorIds(clerkId);
  if (hidden.includes(userId)) { res.status(404).json({ error: "Not found" }); return; }
  const profile = await buildUserProfile(user, clerkId ?? undefined);
  res.json(profile);
});

router.get("/users/:userId/followers", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const userId = String(req.params.userId);
  const rows = await db
    .select({ user: usersTable })
    .from(followsTable)
    .innerJoin(usersTable, eq(followsTable.followerId, usersTable.id))
    .where(eq(followsTable.followingId, userId));
  const profiles = await Promise.all(rows.map(r => buildUserProfile(r.user, clerkId ?? undefined)));
  res.json({ users: profiles });
});

router.get("/users/:userId/following", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const userId = String(req.params.userId);
  const rows = await db
    .select({ user: usersTable })
    .from(followsTable)
    .innerJoin(usersTable, eq(followsTable.followingId, usersTable.id))
    .where(eq(followsTable.followerId, userId));
  const profiles = await Promise.all(rows.map(r => buildUserProfile(r.user, clerkId ?? undefined)));
  res.json({ users: profiles });
});

router.get("/users/:userId/posts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { userId } = GetUserPostsParams.parse(req.params);
  const query = GetUserPostsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const offset = query.success ? (query.data.offset ?? 0) : 0;
  // Resolve the viewer first — Ghost Mode posts must NEVER appear in the
  // by-user listing for any viewer other than the author themselves, since
  // the URL itself binds posts to a specific user and would trivially
  // de-anonymize them.
  const viewerUser = clerkId ? await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) }) : null;
  const viewerDbId = viewerUser?.id ?? null;
  const isViewerAuthor = viewerDbId !== null && viewerDbId === userId;
  // Mutual block hiding — return an empty page if either side has blocked
  // the other. Skip the lookup for self-views (no need to block yourself).
  if (!isViewerAuthor) {
    const hidden = await getHiddenAuthorIds(clerkId);
    if (hidden.includes(userId)) { res.json({ posts: [], total: 0, hasMore: false }); return; }
  }
  const whereClause = isViewerAuthor
    ? eq(postsTable.authorId, userId)
    : and(eq(postsTable.authorId, userId), eq(postsTable.isAnonymous, false));
  const posts = await db.select().from(postsTable).where(whereClause).orderBy(sql`created_at desc`).limit(limit).offset(offset);
  if (posts.length === 0) { res.json({ posts: [], total: 0, hasMore: false }); return; }
  const author = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!author) { res.status(404).json({ error: "Not found" }); return; }
  const postIds = posts.map(p => p.id);
  const [likesRows, commentsRows, repostsRows, myLikesRows, authorProfile] = await Promise.all([
    db.select({ postId: likesTable.postId, count: sql<number>`count(*)` }).from(likesTable).where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId),
    db.select({ postId: commentsTable.postId, count: sql<number>`count(*)` }).from(commentsTable).where(inArray(commentsTable.postId, postIds)).groupBy(commentsTable.postId),
    db.select({ postId: postsTable.originalPostId, count: sql<number>`count(*)` }).from(postsTable).where(and(eq(postsTable.isRepost, 1), inArray(postsTable.originalPostId, postIds))).groupBy(postsTable.originalPostId),
    viewerDbId
      ? db.select({ postId: likesTable.postId }).from(likesTable).where(and(inArray(likesTable.postId, postIds), eq(likesTable.userId, viewerDbId)))
      : Promise.resolve([] as Array<{ postId: number }>),
    buildUserProfile(author, clerkId ?? undefined),
  ]);
  const likesMap = new Map(likesRows.map(r => [r.postId, Number(r.count)]));
  const commentsMap = new Map(commentsRows.map(r => [r.postId, Number(r.count)]));
  const repostsMap = new Map(repostsRows.map(r => [r.postId, Number(r.count)]));
  const myLikeSet = new Set(myLikesRows.map((r) => r.postId));
  // The author themselves still sees their own ghost posts here so they can
  // recognise/manage them. (The author's visible name on those rows stays
  // their real name — matches the buildPost behavior in /posts.)
  // Build response from contract fields only — do NOT spread the raw DB row,
  // which would expose `authorId`/`originalPostId` and is unnecessary.
  const enriched = posts.map(p => ({
    id: p.id,
    content: p.content,
    imageUrl: p.imageUrl ?? null,
    videoUrl: p.videoUrl ?? null,
    mood: p.mood ?? null,
    hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
    author: authorProfile,
    likesCount: likesMap.get(p.id) ?? 0,
    commentsCount: commentsMap.get(p.id) ?? 0,
    repostsCount: repostsMap.get(p.id) ?? 0,
    isLiked: myLikeSet.has(p.id),
    isRepost: p.isRepost === 1,
    isAnonymous: p.isAnonymous === true,
    originalPost: null,
    createdAt: p.createdAt,
  }));
  res.json({ posts: enriched, total: enriched.length, hasMore: enriched.length === limit });
});

router.get("/users/:userId/power-score", async (req, res): Promise<void> => {
  const { userId } = GetUserByIdParams.parse(req.params);
  const result = await getPowerScore(userId);
  res.json(result);
});

router.get("/users/:userId/power-score/stream", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = GetUserByIdParams.parse(req.params);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send initial snapshot.
  const initial = await getPowerScore(userId);
  res.write(`data: ${JSON.stringify({ type: "power-score", score: initial.score, rank: initial.rank, breakdown: initial.breakdown, at: new Date().toISOString() })}\n\n`);

  const unsub = subscribe("power-score", userId, res);
  const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch { /* ignore */ } }, 25_000);

  const close = () => { clearInterval(ka); unsub(); try { res.end(); } catch { /* ignore */ } };
  req.on("close", close);
  req.on("aborted", close);
});

router.get("/users/:userId/streak", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = GetUserByIdParams.parse(req.params);
  res.json(await getStreak(userId));
});

router.get("/users/:userId/achievements", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = GetUserByIdParams.parse(req.params);
  res.json({ achievements: await listAchievements(userId) });
});

router.post("/users/me/achievements/evaluate", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const result = await evaluateAchievements(user.id);
  res.json(result);
});

router.post("/users/me/agent-mode", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const enabled = req.body?.enabled === true;
  const autonomy = req.body?.autonomy === true;
  const consent = req.body?.consent === true;
  const user = await ensureUser(clerkId);
  // Record consent first so the autonomy gate below can see it.
  const hasConsent = !!user.agentConsentedAt || (enabled && consent);
  // Hard gate: turning agent ON requires explicit consent (either previously recorded
  // or supplied in this request). Autonomy ("Set & Forget") additionally requires
  // agent to be enabled with consent — never autonomy without consent.
  if (enabled && !hasConsent) {
    res.status(400).json({ error: "Consent required to enable Agent Mode. Send { enabled:true, consent:true }." });
    return;
  }
  const updates: Record<string, unknown> = {
    agentModeEnabled: enabled,
    agentAutonomyEnabled: enabled && autonomy && hasConsent,
    updatedAt: new Date(),
  };
  if (enabled && consent && !user.agentConsentedAt) {
    updates.agentConsentedAt = new Date();
  }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
  res.json({
    agentModeEnabled: updated.agentModeEnabled,
    agentAutonomyEnabled: updated.agentAutonomyEnabled,
    agentConsentedAt: updated.agentConsentedAt,
  });
});

// Trigger a recompute + streak update for the calling user.
// Called from frontend after high-signal interactions (post create, like, follow).
router.post("/users/me/touch", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  const [streak, score] = await Promise.all([updateStreak(user.id), recomputePowerScore(user.id)]);
  await evaluateAchievements(user.id);
  res.json({ streak, powerScore: score.score, powerRank: score.rank });
});

// Lightweight presence ping. Frontend POSTs this every ~30s while the user is
// active so peers can render an "online now" dot.
router.post("/users/me/heartbeat", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  await db
    .update(usersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

/**
 * Read the current user's notification opt-out flags. Used by the
 * Settings page so the toggles render with the right initial state.
 * Kept as its own endpoint rather than overloading the user profile
 * because these flags are write-on-write-on-write — they shouldn't
 * trigger profile cache invalidations whenever they're flipped.
 */
router.get("/users/me/notification-settings", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await ensureUser(clerkId);
  res.json({
    autonomyEmailEnabled: user.autonomyEmailEnabled,
    autonomyPushEnabled: user.autonomyPushEnabled,
    // Privacy toggle for DM read receipts (task #68). Lives on the same
    // settings payload as the autonomy notification flags because the
    // Settings UI groups all per-user toggles in one place.
    readReceiptsEnabled: user.readReceiptsEnabled,
    hasEmail: !!user.email,
  });
});

/**
 * Toggle the autonomy email/push opt-out flags. PATCH semantics: an
 * omitted field is left untouched, so the web client can flip the email
 * toggle without having to re-send the push value (and vice versa for
 * mobile clients down the line).
 */
router.patch("/users/me/notification-settings", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body as {
    autonomyEmailEnabled?: unknown;
    autonomyPushEnabled?: unknown;
    readReceiptsEnabled?: unknown;
  };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.autonomyEmailEnabled === "boolean") updates.autonomyEmailEnabled = body.autonomyEmailEnabled;
  if (typeof body.autonomyPushEnabled === "boolean") updates.autonomyPushEnabled = body.autonomyPushEnabled;
  if (typeof body.readReceiptsEnabled === "boolean") updates.readReceiptsEnabled = body.readReceiptsEnabled;
  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "At least one of autonomyEmailEnabled, autonomyPushEnabled, or readReceiptsEnabled must be a boolean." });
    return;
  }
  const user = await ensureUser(clerkId);
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
  res.json({
    autonomyEmailEnabled: updated.autonomyEmailEnabled,
    autonomyPushEnabled: updated.autonomyPushEnabled,
    readReceiptsEnabled: updated.readReceiptsEnabled,
  });
});

/**
 * Register a native push token (Expo) for the signed-in user. Called
 * by the mobile app after `Notifications.getExpoPushTokenAsync()` so
 * the autonomy heads-up can reach the user's phone. Idempotent on
 * (userId, token) — re-registering just bumps `updatedAt`.
 */
router.post("/users/me/push-tokens", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = typeof req.body?.platform === "string" ? req.body.platform : null;
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  const user = await ensureUser(clerkId);
  // Atomically reassign ownership to the calling user. Token is the
  // primary key so this single statement covers both first-time
  // registration and account switch on the same device — without it,
  // a stale row owned by the previous user would keep delivering this
  // user's autonomy heads-ups to that other account.
  await db
    .insert(devicePushTokensTable)
    .values({ userId: user.id, token, platform })
    .onConflictDoUpdate({
      target: devicePushTokensTable.token,
      set: { userId: user.id, updatedAt: new Date(), platform },
    });
  res.status(201).json({ ok: true });
});

router.delete("/users/me/push-tokens", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  const user = await ensureUser(clerkId);
  // Scope the delete to the calling user so a leaked token can't be
  // used to deregister another account's device.
  await db
    .delete(devicePushTokensTable)
    .where(and(eq(devicePushTokensTable.token, token), eq(devicePushTokensTable.userId, user.id)));
  res.json({ ok: true });
});

router.put("/users/me/ghost-mode", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "enabled must be boolean" }); return; }
  const user = await ensureUser(clerkId);
  await db.update(usersTable).set({ ghostMode: enabled, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
  res.json({ ghostMode: enabled });
});

router.post("/users/:userId/ghost-view", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { userId } = GetUserByIdParams.parse(req.params);
  let viewerId: string | null = null;
  let isGhost = req.headers["x-ghost-mode"] === "true";
  if (clerkId) {
    const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
    if (viewer) {
      if (viewer.ghostMode) isGhost = true;
      if (!isGhost) viewerId = viewer.id;
    }
  }
  await db.insert(ghostViewsTable).values({ targetId: userId, viewerId, isGhost });
  res.json({ success: true });
});

router.get("/users/:userId/views", async (req, res): Promise<void> => {
  const { userId } = GetUserByIdParams.parse(req.params);
  const [identified] = await db.select({ count: sql<number>`count(*)` }).from(ghostViewsTable).where(
    and(eq(ghostViewsTable.targetId, userId), eq(ghostViewsTable.isGhost, false))
  );
  const [ghost] = await db.select({ count: sql<number>`count(*)` }).from(ghostViewsTable).where(
    and(eq(ghostViewsTable.targetId, userId), eq(ghostViewsTable.isGhost, true))
  );
  res.json({ identifiedViews: Number(identified?.count ?? 0), ghostViews: Number(ghost?.count ?? 0) });
});

router.post("/users/:userId/follow", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = FollowUserParams.parse(req.params);
  const follower = await ensureUser(clerkId);
  const existing = await db.query.followsTable.findFirst({ where: and(eq(followsTable.followerId, follower.id), eq(followsTable.followingId, userId)) });
  if (!existing) {
    await db.insert(followsTable).values({ followerId: follower.id, followingId: userId });
    // Recompute power-score for both follower (network/activity changed) and followee (network/reputation).
    Promise.all([
      recomputePowerScore(follower.id),
      recomputePowerScore(userId),
      updateStreak(follower.id),
      evaluateAchievements(follower.id),
      evaluateAchievements(userId),
    ]).catch(() => {});
  }
  const [followers] = await db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followingId, userId));
  res.json({ following: true, followersCount: Number(followers?.count ?? 0) });
});

router.delete("/users/:userId/follow", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = UnfollowUserParams.parse(req.params);
  const follower = await ensureUser(clerkId);
  await db.delete(followsTable).where(and(eq(followsTable.followerId, follower.id), eq(followsTable.followingId, userId)));
  Promise.all([recomputePowerScore(follower.id), recomputePowerScore(userId)]).catch(() => {});
  const [followers] = await db.select({ count: sql<number>`count(*)` }).from(followsTable).where(eq(followsTable.followingId, userId));
  res.json({ following: false, followersCount: Number(followers?.count ?? 0) });
});

// Endorsements: peer skill endorsements that feed the Power Score reputation
// component. Idempotent via the `endorsements_unq` constraint on
// (endorser, endorsee, skill). Recomputes the endorsee's score on success.
router.post("/users/:userId/endorse", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = GetUserByIdParams.parse(req.params);
  const skill = typeof req.body?.skill === "string" ? req.body.skill.trim() : "";
  if (!skill) { res.status(400).json({ error: "skill is required" }); return; }
  const endorser = await ensureUser(clerkId);
  if (endorser.id === userId) { res.status(400).json({ error: "Cannot endorse yourself" }); return; }
  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  await db
    .insert(endorsementsTable)
    .values({ endorserId: endorser.id, endorseeId: userId, skill })
    .onConflictDoNothing();
  // Trigger recompute (and notification fan-out via the SSE bus inside).
  recomputePowerScore(userId).catch(() => {});
  const [count] = await db
    .select({ count: sql<number>`count(*)` })
    .from(endorsementsTable)
    .where(eq(endorsementsTable.endorseeId, userId));
  res.json({ endorsed: true, endorsementCount: Number(count?.count ?? 0) });
});

router.delete("/users/:userId/endorse", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = GetUserByIdParams.parse(req.params);
  const skill = typeof req.query?.skill === "string" ? req.query.skill.trim() : "";
  if (!skill) { res.status(400).json({ error: "skill is required" }); return; }
  const endorser = await ensureUser(clerkId);
  await db
    .delete(endorsementsTable)
    .where(and(
      eq(endorsementsTable.endorserId, endorser.id),
      eq(endorsementsTable.endorseeId, userId),
      eq(endorsementsTable.skill, skill),
    ));
  recomputePowerScore(userId).catch(() => {});
  res.json({ endorsed: false });
});

router.get("/users/:userId/endorsements", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { userId } = GetUserByIdParams.parse(req.params);
  const rows = await db
    .select({ skill: endorsementsTable.skill, count: sql<number>`count(*)` })
    .from(endorsementsTable)
    .where(eq(endorsementsTable.endorseeId, userId))
    .groupBy(endorsementsTable.skill);
  res.json({
    endorsements: rows.map((r) => ({ skill: r.skill, count: Number(r.count) })),
    total: rows.reduce((s, r) => s + Number(r.count), 0),
  });
});

export default router;
export { ensureUser, buildUserProfile };
