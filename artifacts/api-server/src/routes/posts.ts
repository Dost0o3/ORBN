import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, postsTable, likesTable, commentsTable, notificationsTable } from "@workspace/db";
import { eq, and, or, sql, desc, inArray, notInArray } from "drizzle-orm";
import { getHiddenAuthorIds } from "../lib/blocks";
import { getAuth } from "@clerk/express";
import {
  ListPostsQueryParams,
  CreatePostBody,
  GetPostParams,
  DeletePostParams,
  LikePostParams,
  UnlikePostParams,
  GetPostCommentsParams,
  GetPostCommentsQueryParams,
  CreateCommentParams,
  CreateCommentBody,
  UpdateCommentAnonymityParams,
  UpdateCommentAnonymityBody,
  RepostPostParams,
  GetTrendingPostsQueryParams,
  GetSuggestedUsersQueryParams,
} from "@workspace/api-zod";
import { ensureUser, buildUserProfile, getBatchPowerScores } from "./users";
import { fireUserActivity, createPostForUser, createCommentForPost, PostHelperValidationError } from "../lib/post-helpers";
import { subscribe } from "../lib/sse-bus";
import { randomUUID } from "crypto";

const router = Router();

async function buildPost(post: any, viewerClerkId?: string) {
  const [likesRow, commentsRow, repostsRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(likesTable).where(eq(likesTable.postId, post.id)),
    db.select({ count: sql<number>`count(*)` }).from(commentsTable).where(eq(commentsTable.postId, post.id)),
    db.select({ count: sql<number>`count(*)` }).from(postsTable).where(and(eq(postsTable.isRepost, 1), eq(postsTable.originalPostId, post.id))),
  ]);
  let isLiked = false;
  let viewerDbId: string | null = null;
  if (viewerClerkId) {
    const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, viewerClerkId) });
    if (viewer) {
      viewerDbId = viewer.id;
      const like = await db.query.likesTable.findFirst({ where: and(eq(likesTable.postId, post.id), eq(likesTable.userId, viewer.id)) });
      isLiked = !!like;
    }
  }
  const isAnonymous = post.isAnonymous === true;
  const isViewerAuthor = viewerDbId !== null && viewerDbId === post.authorId;
  // Anonymous posts return `author: null` to non-author viewers. The frontend
  // renders the "Anonymous" UI off `post.isAnonymous`, so we don't need a
  // placeholder author object here (and a placeholder would violate the
  // UserProfile schema's required string fields).
  let authorProfile: Awaited<ReturnType<typeof buildUserProfile>> | null = null;
  if (!isAnonymous || isViewerAuthor) {
    const author = await db.query.usersTable.findFirst({ where: eq(usersTable.id, post.authorId) });
    authorProfile = author ? await buildUserProfile(author, viewerClerkId) : null;
  }
  // Explicitly build the response from contract fields only — never spread the
  // raw DB row, since that would leak `authorId` (and `originalPostId`) on
  // anonymous posts and let any client de-anonymize a Ghost Mode post.
  return {
    id: post.id,
    content: post.content,
    imageUrl: post.imageUrl ?? null,
    videoUrl: post.videoUrl ?? null,
    mood: post.mood ?? null,
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    author: authorProfile,
    likesCount: Number(likesRow[0]?.count ?? 0),
    commentsCount: Number(commentsRow[0]?.count ?? 0),
    repostsCount: Number(repostsRow[0]?.count ?? 0),
    isLiked,
    isRepost: post.isRepost === 1,
    isAnonymous,
    originalPost: null,
    createdAt: post.createdAt,
  };
}

router.get("/posts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const query = ListPostsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const offset = query.success ? (query.data.offset ?? 0) : 0;

  // `?strict=true` returns pure recency ordering with simple offset pagination.
  // Default ordering pulls a wider candidate window (capped at 500), blends
  // recency (0.7) with author power score (0.3), sorts the full window once,
  // then paginates the blended result. This gives reputation real visibility
  // impact across page boundaries while keeping stable pagination semantics.
  const strict = String(req.query.strict ?? "") === "true";
  const candidateLimit = strict ? limit : Math.min(500, Math.max(offset + limit * 5, 100));
  const candidateOffset = strict ? offset : 0;

  // Mutual hiding: see lib/blocks.ts.
  const hiddenAuthorIds = await getHiddenAuthorIds(clerkId);

  const baseWhere = hiddenAuthorIds.length > 0
    ? notInArray(postsTable.authorId, hiddenAuthorIds)
    : undefined;
  const posts = await db
    .select()
    .from(postsTable)
    .where(baseWhere)
    .orderBy(desc(postsTable.createdAt))
    .limit(candidateLimit)
    .offset(candidateOffset);
  const [enriched, total] = await Promise.all([
    Promise.all(posts.map(p => buildPost(p, clerkId ?? undefined))),
    db.select({ count: sql<number>`count(*)` }).from(postsTable).where(baseWhere),
  ]);
  const authorIds = [...new Set(enriched.map(p => p.author?.id).filter((id): id is string => Boolean(id)))];
  const powerScores = await getBatchPowerScores(authorIds);
  const now = Date.now();
  const withPower = enriched.map(p => {
    const ps = p.author ? powerScores.get(p.author.id) : undefined;
    return {
      ...p,
      author: p.author ? { ...p.author, powerScore: ps?.score ?? null, powerRank: ps?.rank ?? null } : null,
      _ps: ps?.score ?? 0,
    };
  });
  const totalCount = Number(total[0]?.count ?? 0);
  if (strict) {
    const stripped = withPower.map(({ _ps: _, ...rest }) => rest);
    res.json({ posts: stripped, total: totalCount, hasMore: offset + stripped.length < totalCount });
    return;
  }
  const blendedAll = withPower
    .map(p => {
      const ageMs = now - new Date(p.createdAt as unknown as string | Date).getTime();
      const recency = Math.max(0, 1 - ageMs / (14 * 24 * 60 * 60 * 1000));
      const power = Math.min(1, p._ps / 1000);
      return { ...p, _blended: recency * 0.7 + power * 0.3 };
    })
    .sort((a, b) => b._blended - a._blended);
  const page = blendedAll.slice(offset, offset + limit).map(({ _ps: _, _blended: _b, ...rest }) => rest);
  // hasMore is conservative: more candidates we ranked OR more rows beyond our window
  const hasMore = offset + limit < blendedAll.length || candidateOffset + posts.length < totalCount;
  res.json({ posts: page, total: totalCount, hasMore });
});

router.post("/posts", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  const { content, imageUrl, videoUrl, mood, hashtags, isAnonymous } = parsed.data;
  try {
    const post = await createPostForUser({
      authorId: user.id,
      content,
      imageUrl: imageUrl ?? null,
      videoUrl: videoUrl ?? null,
      mood: mood ?? null,
      hashtags: hashtags ?? [],
      isAnonymous,
    });
    const enriched = await buildPost(post, clerkId);
    res.status(201).json(enriched);
  } catch (err) {
    if (err instanceof PostHelperValidationError) {
      res.status(err.status).json({ error: err.message }); return;
    }
    throw err;
  }
});

router.get("/posts/:postId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { postId } = GetPostParams.parse(req.params);
  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, Number(postId)) });
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  // Mutual block hiding — return 404 (not 403) so we don't leak that the
  // post exists and that the relationship is a block. Mirrors the listing
  // endpoints which simply omit the row.
  const hidden = await getHiddenAuthorIds(clerkId);
  if (hidden.includes(post.authorId)) { res.status(404).json({ error: "Not found" }); return; }
  const enriched = await buildPost(post, clerkId ?? undefined);
  res.json(enriched);
});

router.delete("/posts/:postId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { postId } = DeletePostParams.parse(req.params);
  const user = await ensureUser(clerkId);
  await db.delete(postsTable).where(and(eq(postsTable.id, Number(postId)), eq(postsTable.authorId, user.id)));
  res.json({ success: true });
});

router.post("/posts/:postId/like", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { postId } = LikePostParams.parse(req.params);
  const user = await ensureUser(clerkId);
  const existing = await db.query.likesTable.findFirst({ where: and(eq(likesTable.postId, Number(postId)), eq(likesTable.userId, user.id)) });
  if (!existing) {
    await db.insert(likesTable).values({ postId: Number(postId), userId: user.id });
    // Recompute the post author's power-score (their likes-received changed).
    const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, Number(postId)) });
    if (post && post.authorId !== user.id) fireUserActivity(post.authorId);
    fireUserActivity(user.id);
  }
  const [likes] = await db.select({ count: sql<number>`count(*)` }).from(likesTable).where(eq(likesTable.postId, Number(postId)));
  res.json({ liked: true, likesCount: Number(likes?.count ?? 0) });
});

router.delete("/posts/:postId/like", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { postId } = UnlikePostParams.parse(req.params);
  const user = await ensureUser(clerkId);
  await db.delete(likesTable).where(and(eq(likesTable.postId, Number(postId)), eq(likesTable.userId, user.id)));
  const [likes] = await db.select({ count: sql<number>`count(*)` }).from(likesTable).where(eq(likesTable.postId, Number(postId)));
  res.json({ liked: false, likesCount: Number(likes?.count ?? 0) });
});

router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const { postId } = GetPostCommentsParams.parse(req.params);
  const query = GetPostCommentsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const viewer = clerkId
    ? (await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) })) ?? null
    : null;
  // Mutual hiding: see lib/blocks.ts.
  const hiddenAuthorIds = await getHiddenAuthorIds(clerkId);
  const commentsWhere = hiddenAuthorIds.length > 0
    ? and(eq(commentsTable.postId, Number(postId)), notInArray(commentsTable.authorId, hiddenAuthorIds))
    : eq(commentsTable.postId, Number(postId));
  const [comments, totalRow] = await Promise.all([
    db.select().from(commentsTable).where(commentsWhere).orderBy(desc(commentsTable.createdAt)).limit(limit),
    db.select({ count: sql<number>`count(*)` }).from(commentsTable).where(commentsWhere),
  ]);
  const totalComments = Number(totalRow[0]?.count ?? 0);
  // Anonymous comments only show their real author back to the commenter
  // themselves — every other viewer (including the parent post's author)
  // gets `author: null` so the client renders the "Anonymous" UI. We build
  // the response from contract fields only to avoid leaking `authorId`.
  const enriched = await Promise.all(comments.map(async (c) => {
    const isAnonymous = c.isAnonymous === true;
    const isViewerCommenter = viewer !== null && viewer.id === c.authorId;
    let authorProfile: Awaited<ReturnType<typeof buildUserProfile>> | null = null;
    if (!isAnonymous || isViewerCommenter) {
      const author = await db.query.usersTable.findFirst({ where: eq(usersTable.id, c.authorId) });
      authorProfile = author ? await buildUserProfile(author, clerkId ?? undefined) : null;
    }
    return {
      id: c.id,
      content: c.content,
      author: authorProfile,
      isAnonymous,
      createdAt: c.createdAt,
    };
  }));
  res.json({ comments: enriched, total: totalComments });
});

router.post("/posts/:postId/comments", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { postId } = CreateCommentParams.parse(req.params);
  const parsed = CreateCommentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const user = await ensureUser(clerkId);
  try {
    const comment = await createCommentForPost({
      authorId: user.id,
      postId: Number(postId),
      content: parsed.data.content,
      isAnonymous: parsed.data.isAnonymous,
    });
    // The commenter always sees their own real identity on their own
    // comments — masking only applies when other viewers fetch the comment
    // list back. So we attach the real author profile here regardless of
    // `isAnonymous`.
    const authorProfile = await buildUserProfile(user, clerkId);
    res.status(201).json({
      id: comment.id,
      content: comment.content,
      author: authorProfile,
      isAnonymous: comment.isAnonymous === true,
      createdAt: comment.createdAt,
    });
  } catch (err) {
    if (err instanceof PostHelperValidationError) {
      res.status(err.status).json({ error: err.message }); return;
    }
    throw err;
  }
});

router.patch("/posts/:postId/comments/:commentId", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = UpdateCommentAnonymityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error }); return; }
  const parsed = UpdateCommentAnonymityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error }); return; }
  const { postId, commentId } = params.data;
  const user = await ensureUser(clerkId);
  const comment = await db.query.commentsTable.findFirst({
    where: and(eq(commentsTable.id, Number(commentId)), eq(commentsTable.postId, Number(postId))),
  });
  if (!comment) { res.status(404).json({ error: "Not found" }); return; }
  // Only the original commenter may flip their own comment's anonymity.
  if (comment.authorId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
  const nextAnonymous = parsed.data.isAnonymous === true;
  if (comment.isAnonymous === nextAnonymous) {
    // No-op flip — still return the current shape so the client can refresh state.
    const authorProfile = await buildUserProfile(user, clerkId);
    res.json({
      id: comment.id,
      content: comment.content,
      author: authorProfile,
      isAnonymous: comment.isAnonymous === true,
      createdAt: comment.createdAt,
    });
    return;
  }
  // Wrap the comment flip and notification rewrite in a single transaction so
  // they can never diverge — a partial failure (comment flipped to anonymous
  // but notification.actorId still pointing at the commenter) would let the
  // post owner de-anonymize via the notifications feed, defeating the whole
  // point of this endpoint.
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(commentsTable)
      .set({ isAnonymous: nextAnonymous })
      .where(and(eq(commentsTable.id, Number(commentId)), eq(commentsTable.authorId, user.id)))
      .returning();
    const post = await tx.query.postsTable.findFirst({ where: eq(postsTable.id, Number(postId)) });
    if (post && post.authorId !== user.id) {
      const candidates = await tx
        .select()
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.userId, post.authorId),
          eq(notificationsTable.postId, Number(postId)),
          eq(notificationsTable.type, "comment"),
        ));
      let match = candidates.find((n) => {
        const meta = n.metadata as { commentId?: number } | null;
        return meta?.commentId === Number(commentId);
      });
      // Legacy fallback: notifications written before we started stamping
      // metadata.commentId (or where metadata was dropped) won't match by id.
      // Identify them by the previous anonymity state — an anonymous comment's
      // notification has actorId IS NULL and an attributed one has
      // actorId = commenter — and disambiguate by createdAt proximity to the
      // comment. Without this, re-anonymizing an older attributed comment
      // would leave notifications.actorId intact and the post owner could
      // still de-anonymize it via the notifications feed.
      if (!match) {
        const wasAnonymous = comment.isAnonymous === true;
        const expectedActorId = wasAnonymous ? null : user.id;
        const legacy = candidates.filter((n) => {
          const meta = n.metadata as { commentId?: number } | null;
          if (meta?.commentId !== undefined) return false;
          return wasAnonymous ? n.actorId === null : n.actorId === expectedActorId;
        });
        if (legacy.length > 0) {
          const target = new Date(comment.createdAt as unknown as string | Date).getTime();
          legacy.sort((a, b) => {
            const da = Math.abs(new Date(a.createdAt as unknown as string | Date).getTime() - target);
            const db_ = Math.abs(new Date(b.createdAt as unknown as string | Date).getTime() - target);
            return da - db_;
          });
          match = legacy[0];
        }
      }
      if (match) {
        // Let errors bubble out of the transaction so the comment flip is
        // rolled back rather than committed alongside a stale notification.
        //
        // We also bump `read: false` + `createdAt: now()` so the post owner
        // sees this as a *fresh* signal — without the bump, an already-read
        // notification would silently mutate from "Someone commented" to
        // "Someone commented anonymously" (or vice versa) with no UI cue
        // that anything happened. Bumping floats the row to the top of the
        // feed and re-increments the unread count.
        const flipMessage = nextAnonymous
          ? "A commenter on your post made their comment anonymous"
          : "An anonymous commenter on your post revealed their identity";
        await tx
          .update(notificationsTable)
          .set({
            actorId: nextAnonymous ? null : user.id,
            message: flipMessage,
            read: false,
            createdAt: new Date(),
            // Backfill the linkage so subsequent toggles match deterministically
            // and don't have to fall back to createdAt-proximity again. Stamp
            // `flipped` so the client can render an event badge ("Just
            // revealed", "Just hidden") rather than a generic "new comment".
            metadata: {
              commentId: Number(commentId),
              flipped: nextAnonymous ? "hidden" : "revealed",
            },
          })
          .where(eq(notificationsTable.id, match.id));
      }
    }
    return row;
  });
  const authorProfile = await buildUserProfile(user, clerkId);
  res.json({
    id: updated.id,
    content: updated.content,
    author: authorProfile,
    isAnonymous: updated.isAnonymous === true,
    createdAt: updated.createdAt,
  });
});

router.post("/posts/:postId/repost", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { postId } = RepostPostParams.parse(req.params);
  const user = await ensureUser(clerkId);
  const original = await db.query.postsTable.findFirst({ where: eq(postsTable.id, Number(postId)) });
  if (!original) { res.status(404).json({ error: "Not found" }); return; }
  // Prevent duplicate reposts of the same post by the same user.
  const existing = await db.query.postsTable.findFirst({
    where: and(eq(postsTable.authorId, user.id), eq(postsTable.originalPostId, Number(postId))),
  });
  if (existing) { res.status(409).json({ error: "Already reposted" }); return; }
  const [repost] = await db.insert(postsTable).values({ authorId: user.id, content: original.content, isRepost: 1, originalPostId: Number(postId), hashtags: original.hashtags ?? [] }).returning();
  const enriched = await buildPost(repost, clerkId);
  res.status(201).json(enriched);
});

// Feed endpoints
router.get("/feed/trending", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const query = GetTrendingPostsQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 10) : 10;
  const strict = String(req.query.strict ?? "") === "true";
  // Pull a wider window for trending so blended ordering can surface high-power authors.
  const candidateLimit = strict ? limit : Math.max(limit * 3, 30);
  // Mutual hiding for trending too — see lib/blocks.ts.
  const hiddenAuthorIds = await getHiddenAuthorIds(clerkId);
  const trendingWhere = hiddenAuthorIds.length > 0
    ? notInArray(postsTable.authorId, hiddenAuthorIds)
    : undefined;
  const posts = await db.select().from(postsTable).where(trendingWhere).orderBy(desc(postsTable.createdAt)).limit(candidateLimit);
  const enriched = await Promise.all(posts.map(p => buildPost(p, clerkId ?? undefined)));
  const authorIds = [...new Set(enriched.map(p => p.author?.id).filter((id): id is string => Boolean(id)))];
  const powerScores = await getBatchPowerScores(authorIds);
  const now = Date.now();
  const withPower = enriched.map(p => {
    const ps = p.author ? powerScores.get(p.author.id) : undefined;
    return {
      ...p,
      author: p.author ? { ...p.author, powerScore: ps?.score ?? null, powerRank: ps?.rank ?? null } : null,
      _ps: ps?.score ?? 0,
    };
  });
  const enrichedWithPower = strict
    ? withPower.slice(0, limit).map(({ _ps: _, ...rest }) => rest)
    : withPower
        .map(p => {
          const ageMs = now - new Date(p.createdAt as unknown as string | Date).getTime();
          const recency = Math.max(0, 1 - ageMs / (14 * 24 * 60 * 60 * 1000));
          const power = Math.min(1, p._ps / 1000);
          return { ...p, _blended: recency * 0.7 + power * 0.3 };
        })
        .sort((a, b) => b._blended - a._blended)
        .slice(0, limit)
        .map(({ _ps: _, _blended: _b, ...rest }) => rest);
  res.json({ posts: enrichedWithPower, total: enrichedWithPower.length, hasMore: false });
});

router.get("/feed/suggested-users", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const query = GetSuggestedUsersQueryParams.safeParse(req.query);
  const limit = query.success ? (query.data.limit ?? 5) : 5;
  let users;
  if (clerkId) {
    const viewer = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
    if (viewer) {
      // Exclude the viewer themselves AND anyone in the mutual-block set —
      // suggesting a blocked account would be a glaring bug for task #66.
      const hidden = await getHiddenAuthorIds(clerkId);
      const excludedIds = [viewer.id, ...hidden];
      users = await db.select().from(usersTable).where(notInArray(usersTable.id, excludedIds)).orderBy(sql`random()`).limit(limit);
    } else {
      users = await db.select().from(usersTable).orderBy(sql`random()`).limit(limit);
    }
  } else {
    users = await db.select().from(usersTable).orderBy(sql`random()`).limit(limit);
  }
  const [profiles, powerScores] = await Promise.all([
    Promise.all(users.map(u => buildUserProfile(u, clerkId ?? undefined))),
    getBatchPowerScores(users.map(u => u.id)),
  ]);
  const profilesWithPower = profiles.map(p => ({
    ...p,
    powerScore: powerScores.get(p.id)?.score ?? null,
    powerRank: powerScores.get(p.id)?.rank ?? null,
  }));
  res.json({ users: profilesWithPower });
});

// Long-lived SSE stream for the current user's open feed view. Currently
// only the Soul Twin comment-undo path publishes here ("comment-removed"),
// so an open post's comment list can drop the row in real time without
// waiting for the next refetch. Mirrors the shape of /messages/stream.
router.get("/feed/stream", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const me = await ensureUser(clerkId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({ type: "ready", at: new Date().toISOString() })}\n\n`,
  );

  const unsub = subscribe("feed", me.id, res);
  const ka = setInterval(() => {
    try {
      res.write(": ka\n\n");
    } catch {
      /* ignore */
    }
  }, 25_000);

  const close = () => {
    clearInterval(ka);
    unsub();
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  req.on("close", close);
  req.on("aborted", close);
});

router.get("/feed/hashtags", async (_req, res) => {
  // Compute trending hashtags from posts created in the last 14 days.
  const rows = await db.execute(sql`
    SELECT tag, COUNT(*)::int AS count
    FROM (
      SELECT lower(unnest(hashtags)) AS tag
      FROM ${postsTable}
      WHERE created_at > now() - interval '14 days'
        AND hashtags IS NOT NULL
        AND array_length(hashtags, 1) > 0
    ) t
    WHERE tag <> ''
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT 8
  `);
  // drizzle returns { rows: [...] } for raw queries
  const list = (rows as unknown as { rows: Array<{ tag: string; count: number }> }).rows
    ?? (rows as unknown as Array<{ tag: string; count: number }>);
  res.json({ hashtags: Array.isArray(list) ? list : [] });
});

export default router;
