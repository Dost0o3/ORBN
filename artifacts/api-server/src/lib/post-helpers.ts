import {
  db,
  postsTable,
  commentsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { recomputePowerScore } from "./power-score";
import { updateStreak } from "./streaks";
import { evaluateAchievements } from "./achievements";
import { logger } from "./logger";

/**
 * Background side-effects fired after any user activity that bumps
 * power-score / streaks / achievements. Fire-and-forget so route latency
 * isn't affected; callers (route handlers, agent execution) all use this
 * one entry point so the side-effect set doesn't drift between paths.
 */
export function fireUserActivity(userId: string): void {
  Promise.all([
    recomputePowerScore(userId),
    updateStreak(userId),
    evaluateAchievements(userId),
  ]).catch(() => {});
}

/**
 * Thrown by `createPostForUser` / `createCommentForPost` for validation
 * failures (empty content, missing target post). Routes catch this to map
 * back to a 4xx response instead of bubbling as 500.
 */
export class PostHelperValidationError extends Error {
  constructor(message: string, public readonly status: 400 | 404) {
    super(message);
    this.name = "PostHelperValidationError";
  }
}

export interface CreatePostInput {
  authorId: string;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  mood?: string | null;
  hashtags?: string[];
  /**
   * Per-post anonymity override. When provided, takes precedence over the
   * author's account-wide Ghost Mode setting (in either direction). When
   * `undefined`, the author's Ghost Mode flag determines anonymity.
   */
  isAnonymous?: boolean;
}

/**
 * Insert a post on behalf of a user, honouring Ghost Mode (so a post made
 * while Ghost Mode is on is permanently attributed to "Anonymous"). Shared
 * by the user-driven `/posts` route and the Soul Twin agent so both paths
 * behave identically — same anonymity rules, same activity counters.
 *
 * Callers can pass `isAnonymous` to override the account-wide Ghost Mode
 * for a single post (used by the per-post "Post anonymously" toggle on the
 * create-post screen).
 */
export async function createPostForUser(input: CreatePostInput) {
  const trimmed = input.content?.trim();
  if (!trimmed) throw new PostHelperValidationError("Content required", 400);
  const author = await db.query.usersTable.findFirst({ where: eq(usersTable.id, input.authorId) });
  if (!author) throw new PostHelperValidationError("Author not found", 404);
  const isAnonymous = typeof input.isAnonymous === "boolean"
    ? input.isAnonymous
    : author.ghostMode === true;
  const [post] = await db
    .insert(postsTable)
    .values({
      authorId: author.id,
      content: trimmed,
      imageUrl: input.imageUrl ?? null,
      videoUrl: input.videoUrl ?? null,
      mood: input.mood ?? null,
      hashtags: input.hashtags ?? [],
      isRepost: 0,
      isAnonymous,
    })
    .returning();
  fireUserActivity(author.id);
  return post;
}

export interface CreateCommentInput {
  authorId: string;
  postId: number;
  content: string;
  /**
   * Per-comment anonymity toggle. Independent of the author's account-wide
   * Ghost Mode setting (Ghost Mode does not currently apply to comments).
   * When true, the comment is stored anonymously and other viewers — including
   * the parent post's author — see it as "Anonymous".
   */
  isAnonymous?: boolean;
}

/**
 * Insert a comment on a post and notify the post owner (when the commenter
 * is not the owner). Shared by the user-driven `/posts/:id/comments` route
 * and the Soul Twin agent so both paths produce identical comments and the
 * post owner sees a notification regardless of which path created the row.
 *
 * For anonymous comments we deliberately omit `actorId` on the notification
 * so the post owner cannot de-anonymize the commenter via the notifications
 * feed (which enriches `actorId` into a name + avatar).
 */
export async function createCommentForPost(input: CreateCommentInput) {
  const trimmed = input.content?.trim();
  if (!trimmed) throw new PostHelperValidationError("Content required", 400);
  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, input.postId) });
  if (!post) throw new PostHelperValidationError("Target post not found", 404);
  const isAnonymous = input.isAnonymous === true;
  const [comment] = await db
    .insert(commentsTable)
    .values({ postId: input.postId, authorId: input.authorId, content: trimmed, isAnonymous })
    .returning();
  if (post.authorId !== input.authorId) {
    await db
      .insert(notificationsTable)
      .values({
        userId: post.authorId,
        type: "comment",
        message: isAnonymous
          ? "Someone commented anonymously on your post"
          : "Someone commented on your post",
        actorId: isAnonymous ? null : input.authorId,
        postId: input.postId,
        // Stash the commentId so a later anonymity flip
        // (PATCH /posts/:postId/comments/:commentId) can find this exact
        // notification row and rewrite its actorId/message in lockstep with
        // the new state, instead of guessing by recency.
        metadata: { commentId: comment.id },
      })
      .catch((err) => logger.warn({ err, postId: input.postId }, "comment notification insert failed"));
  }
  fireUserActivity(input.authorId);
  return comment;
}
