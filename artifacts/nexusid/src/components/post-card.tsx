import { useState } from "react";
import { Link } from "wouter";
import { Heart, MessageSquare, Repeat2, Share2, MoreHorizontal, Trash2, Ghost, Flag, Ban, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { VerificationBadge } from "@/components/verification-badge";
import { cn } from "@/lib/utils";
import {
  useLikePost,
  useUnlikePost,
  useDeletePost,
  useGetPostComments,
  useCreateComment,
  useUpdateCommentAnonymity,
  useRepostPost,
  useBlockUser,
  useUnblockUser,
  useReportUser,
  useListMyBlocks,
  getGetPostCommentsQueryKey,
  getListMyBlocksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useUser } from "@clerk/react";
import PowerBadge from "@/components/power-badge";
import { useToast } from "@/hooks/use-toast";

interface PostCardProps {
  post: any;
  onDelete?: () => void;
  showComments?: boolean;
}

const moodBg: Record<string, string> = {
  motivational: "border-[#DC143C]/25 bg-[#DC143C]/8 text-[#DC143C]",
  professional: "border-blue-500/25 bg-blue-500/8 text-blue-400",
  collaborative: "border-emerald-500/25 bg-emerald-500/8 text-emerald-400",
  creative: "border-purple-500/25 bg-purple-500/8 text-purple-400",
};

export default function PostCard({ post, onDelete, showComments: defaultShowComments = false }: PostCardProps) {
  const { user } = useUser();
  const [liked, setLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount ?? 0);
  const [commentsCount, setCommentsCount] = useState<number>(post.commentsCount ?? 0);
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [commentText, setCommentText] = useState("");
  // Tracks which of the current user's anonymous comments is awaiting a
  // confirm-before-reveal step. Null when no confirm is open. Only the
  // reveal direction is gated; "Go ghost" is the safer direction and
  // fires immediately (matches the prior UX).
  const [confirmRevealCommentId, setConfirmRevealCommentId] = useState<number | null>(null);
  const [commentAnonymous, setCommentAnonymous] = useState(false);

  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const deletePost = useDeletePost();
  const createComment = useCreateComment();
  const updateCommentAnon = useUpdateCommentAnonymity();
  const repostPost = useRepostPost();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportUser = useReportUser();
  const queryClientForBlocks = useQueryClient();
  const { data: myBlocks } = useListMyBlocks({
    query: { queryKey: getListMyBlocksQueryKey(), enabled: !!user },
  });
  const blockedUserIds = new Set(myBlocks?.blockedUserIds ?? []);
  const { toast } = useToast();
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState<number>(post.repostsCount ?? 0);
  // The report dialog is shared between the post-level overflow menu and
  // each comment row's menu. Tracking the target user (id + display name)
  // here lets a single dialog instance serve all rows; null = closed.
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState("");

  const handleBlockToggle = async (targetId: string, displayName: string) => {
    const isBlocked = blockedUserIds.has(targetId);
    try {
      if (isBlocked) {
        await unblockUser.mutateAsync({ userId: targetId });
        await queryClientForBlocks.invalidateQueries({ queryKey: getListMyBlocksQueryKey() });
        toast({ title: "User unblocked", description: `${displayName} can show up in your feed again.` });
      } else {
        await blockUser.mutateAsync({ userId: targetId });
        await queryClientForBlocks.invalidateQueries({ queryKey: getListMyBlocksQueryKey() });
        toast({ title: "User blocked", description: "Their posts and comments are now hidden." });
      }
    } catch {
      toast({ title: isBlocked ? "Could not unblock" : "Could not block", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleRepost = async () => {
    if (reposted || repostPost.isPending) return;
    setReposted(true);
    setRepostsCount((c) => c + 1);
    try {
      await repostPost.mutateAsync({ postId: Number(post.id) });
      toast({ title: "Reposted", description: "The signal is amplified." });
    } catch (err: any) {
      // rollback optimistic state
      setReposted(false);
      setRepostsCount((c) => Math.max(0, c - 1));
      const status = err?.response?.status ?? err?.status;
      if (status === 409) {
        setReposted(true);
        toast({ title: "Already reposted", description: "You've already reposted this." });
      } else {
        toast({ title: "Repost failed", description: "Try again in a moment.", variant: "destructive" });
      }
    }
  };

  const handleShare = async () => {
    const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    // No /post/:id detail route exists; deep-link to the author's profile instead.
    const url = post.author?.id
      ? `${window.location.origin}${basePath}/profile/${post.author.id}`
      : `${window.location.origin}${basePath}/feed`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `Post by ${post.author?.displayName ?? "ORBN"}` });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Drop it where it matters." });
      }
    } catch {
      // user-cancel: silent
    }
  };

  const { data: commentsData } = useGetPostComments(Number(post.id), {});
  const queryClient = useQueryClient();

  const handleLike = async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikesCount((c: number) => c + (wasLiked ? -1 : 1));
    try {
      if (wasLiked) {
        await unlikePost.mutateAsync({ postId: Number(post.id) });
      } else {
        await likePost.mutateAsync({ postId: Number(post.id) });
      }
    } catch {
      // rollback
      setLiked(wasLiked);
      setLikesCount((c: number) => c + (wasLiked ? 1 : -1));
      toast({ title: wasLiked ? "Unlike failed" : "Like failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deletePost.mutateAsync({ postId: Number(post.id) });
      toast({ title: "Post deleted" });
      onDelete?.();
    } catch {
      toast({ title: "Delete failed", description: "Try again.", variant: "destructive" });
    }
  };

  const handleToggleCommentAnon = async (commentId: number, current: boolean) => {
    try {
      await updateCommentAnon.mutateAsync({
        postId: Number(post.id),
        commentId,
        data: { isAnonymous: !current },
      });
      await queryClient.invalidateQueries({ queryKey: getGetPostCommentsQueryKey(Number(post.id), {}) });
      toast({ title: !current ? "Comment hidden" : "Comment revealed" });
    } catch {
      toast({ title: "Couldn't update comment", description: "Try again.", variant: "destructive" });
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const text = commentText.trim();
    const anon = commentAnonymous;
    setCommentText("");
    setCommentAnonymous(false);
    setCommentsCount((c) => c + 1);
    try {
      await createComment.mutateAsync({ postId: Number(post.id), data: { content: text, isAnonymous: anon } });
      // Refetch comments so the new one appears immediately under the open post.
      await queryClient.invalidateQueries({ queryKey: getGetPostCommentsQueryKey(Number(post.id), {}) });
      toast({ title: "Comment posted" });
    } catch {
      setCommentText(text);
      setCommentsCount((c) => Math.max(0, c - 1));
      toast({ title: "Comment failed", description: "Try again.", variant: "destructive" });
    }
  };

  const isOwner = user && post.author?.clerkId === user.id;
  const isAnonymous = post.isAnonymous === true;
  const profileHref = !isAnonymous && post.author?.id ? `/profile/${post.author.id}` : null;

  return (
    <article className="group relative glass mb-3 lift-3d transition-all duration-300 hover:border-[#E8754A]/35">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E8754A]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="p-4 relative">
        <div className="flex gap-3">
          {profileHref ? (
            <Link href={profileHref} className="relative shrink-0">
              <div className="absolute inset-0 bg-[#E8754A]/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
              <Avatar className="w-9 h-9 border border-[#E8754A]/30 shrink-0 cursor-pointer relative ring-1 ring-[#E8754A]/10 ring-offset-2 ring-offset-black">
                <AvatarImage src={post.author?.avatarUrl} />
                <AvatarFallback className="text-xs bg-gradient-to-br from-[#E8754A]/20 to-[#DC143C]/10 text-[#E8754A] font-bold">
                  {post.author?.displayName?.[0]?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <div className="relative shrink-0" aria-label="Anonymous">
              <Avatar className="w-9 h-9 border border-white/15 shrink-0 relative">
                <AvatarFallback className="text-xs bg-white/5 text-white/55 font-bold">
                  <Ghost className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {profileHref ? (
                <Link href={profileHref} className="font-bold text-sm hover:text-[#E8754A] transition-colors truncate inline-flex items-center gap-1">
                  {post.author?.displayName}
                  <VerificationBadge tier={post.author?.verificationTier} />
                </Link>
              ) : (
                <span className="font-bold text-sm text-white/85 truncate inline-flex items-center gap-1.5">
                  <Ghost className="w-3.5 h-3.5 text-white/55" />
                  Anonymous
                </span>
              )}
              {!isAnonymous && (
                <span className="text-white/30 text-xs shrink-0">
                  @{post.author?.username}
                </span>
              )}
              {isAnonymous && (
                <span className="text-[9px] font-black text-white/45 border border-white/15 px-1 py-0.5 uppercase tracking-wider shrink-0">
                  Ghost
                </span>
              )}
              {!isAnonymous && (
                <PowerBadge score={post.author?.powerScore} rank={post.author?.powerRank} showRank={false} />
              )}
              {!isAnonymous && post.author?.bountiesWon > 0 && (
                <span className="text-[9px] font-black text-[#DC143C]/70 border border-[#DC143C]/25 px-1 py-0.5 uppercase tracking-wider shrink-0">
                  🎯 {post.author.bountiesWon}W
                </span>
              )}
              {post.mood && (
                <span className={cn("text-[9px] font-black px-1.5 py-0.5 border uppercase tracking-wider shrink-0", moodBg[post.mood] ?? "border-white/10 bg-white/5 text-white/35")}>
                  {post.mood}
                </span>
              )}
              <span className="text-white/25 text-[10px] shrink-0 ml-auto">
                {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ""}
              </span>
              {(isOwner || (user && !isAnonymous && post.author?.id)) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-6 h-6 text-white/30 border-transparent">
                      <MoreHorizontal className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-black border-[#E8754A]/20">
                    {isOwner && (
                      <DropdownMenuItem onClick={handleDelete} className="text-[#DC143C] hover:text-[#DC143C] text-xs font-bold uppercase tracking-wider">
                        <Trash2 className="w-3 h-3 mr-2" /> Delete
                      </DropdownMenuItem>
                    )}
                    {!isOwner && !isAnonymous && post.author?.id && (
                      <>
                        <DropdownMenuItem
                          onClick={() => handleBlockToggle(post.author!.id as string, post.author!.displayName ?? "User")}
                          className="text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider"
                        >
                          <Ban className="w-3 h-3 mr-2" /> {blockedUserIds.has(post.author.id) ? "Unblock" : "Block"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setReportReason("");
                            setReportTarget({ id: post.author!.id as string, name: post.author!.displayName ?? "User" });
                          }}
                          className="text-[#DC143C] hover:text-[#DC143C] text-xs font-bold uppercase tracking-wider"
                        >
                          <Flag className="w-3 h-3 mr-2" /> Report
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {post.isRepost && (
              <div className="text-[10px] text-white/30 mb-1.5 flex items-center gap-1 uppercase tracking-wider font-bold">
                <Repeat2 className="w-3 h-3" /> Reposted
              </div>
            )}

            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-white/85">{post.content}</p>

            {post.imageUrl && (
              <img
                src={post.imageUrl}
                alt="Post media"
                loading="lazy"
                decoding="async"
                className="mt-3 max-h-72 w-auto object-cover border border-[#E8754A]/15"
              />
            )}

            {post.videoUrl && (
              <video
                src={post.videoUrl}
                controls
                preload="metadata"
                className="mt-3 w-full max-h-72 border border-[#E8754A]/15 bg-black"
              />
            )}

            {post.hashtags && post.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.hashtags.map((tag: string) => (
                  <span key={tag} className="text-[11px] text-[#E8754A]/70 hover:text-[#E8754A] cursor-pointer font-bold transition-colors">#{tag}</span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-5 mt-3">
              <button
                onClick={handleLike}
                aria-label={liked ? `Unlike post (${likesCount} likes)` : `Like post (${likesCount} likes)`}
                aria-pressed={liked}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-bold transition-colors uppercase tracking-wider",
                  liked ? "text-[#E8754A]" : "text-white/30 hover:text-[#E8754A]"
                )}
              >
                <Heart className={cn("w-3.5 h-3.5", liked && "fill-[#E8754A]")} />
                {likesCount > 0 && <span>{likesCount}</span>}
              </button>

              <button
                onClick={() => setShowComments(!showComments)}
                aria-label={`${showComments ? "Hide" : "Show"} comments (${commentsCount})`}
                aria-expanded={showComments}
                className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-[#E8754A] transition-colors font-bold uppercase tracking-wider"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {commentsCount > 0 && <span>{commentsCount}</span>}
              </button>

              <button
                onClick={handleRepost}
                disabled={reposted || repostPost.isPending}
                aria-label={reposted ? `Reposted (${repostsCount})` : `Repost (${repostsCount} reposts)`}
                aria-pressed={reposted}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-bold transition-colors uppercase tracking-wider",
                  reposted ? "text-emerald-400" : "text-white/30 hover:text-emerald-400"
                )}
              >
                <Repeat2 className="w-3.5 h-3.5" />
                {repostsCount > 0 && <span>{repostsCount}</span>}
              </button>

              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-[#E8754A] transition-colors ml-auto font-bold"
                aria-label="Share post"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {showComments && (
          <div className="mt-3 pl-12">
            <form onSubmit={handleComment} className="mb-3">
              <div className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={commentAnonymous ? "Drop a comment anonymously..." : "Drop a comment..."}
                  className="h-8 text-xs bg-black border border-[#E8754A]/15 focus:border-[#E8754A]/40 text-white placeholder:text-white/25"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-[11px] bg-[#E8754A] text-black font-black uppercase tracking-wider border-[#E8754A]"
                  disabled={!commentText.trim()}
                >
                  Post
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setCommentAnonymous((v) => !v)}
                aria-pressed={commentAnonymous}
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                  commentAnonymous ? "text-white/85" : "text-white/30 hover:text-white/55"
                )}
              >
                <Ghost className={cn("w-3 h-3", commentAnonymous && "text-white/85")} />
                {commentAnonymous ? "Commenting as Anonymous" : "Comment anonymously"}
              </button>
            </form>
            {commentsData?.comments?.map((c: any) => {
              const cIsAnon = c.isAnonymous === true;
              const cAuthor = c.author;
              // The list endpoint only returns the real author profile back to the
              // commenter themselves, so a non-null `author.clerkId` matching the
              // signed-in user is a safe "this is mine" check.
              const cIsMine = !!user && !!cAuthor?.clerkId && cAuthor.clerkId === user.id;
              return (
                <div key={c.id} className="flex gap-2 mb-2">
                  {cAuthor ? (
                    <Avatar className="w-6 h-6 border border-[#E8754A]/20 shrink-0">
                      <AvatarImage src={cAuthor.avatarUrl} />
                      <AvatarFallback className="text-[10px] bg-[#E8754A]/10 text-[#E8754A] font-bold">{cAuthor.displayName?.[0] ?? "U"}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="w-6 h-6 border border-white/15 shrink-0" aria-label="Anonymous">
                      <AvatarFallback className="text-[10px] bg-white/5 text-white/55 font-bold">
                        <Ghost className="w-3 h-3" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="bg-white/3 border border-[#E8754A]/8 px-2.5 py-1.5 flex-1">
                    {cAuthor ? (
                      <span className="text-[11px] font-bold mr-1.5 text-[#E8754A]/80 inline-flex items-center gap-1">
                        {cAuthor.displayName}
                        <VerificationBadge tier={cAuthor.verificationTier} />
                        {cIsAnon && (
                          <span className="text-[8px] font-black text-white/45 border border-white/15 px-1 py-0.5 uppercase tracking-wider">
                            Ghost (you)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold mr-1.5 text-white/70 inline-flex items-center gap-1">
                        <Ghost className="w-3 h-3 text-white/55" />
                        Anonymous
                      </span>
                    )}
                    <span className="text-xs text-white/70">{c.content}</span>
                    {!cIsMine && !cIsAnon && cAuthor?.id && user && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`More actions for comment by ${cAuthor.displayName ?? "user"}`}
                            className="ml-2 w-5 h-5 align-middle text-white/30 border-transparent inline-flex"
                          >
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-black border-[#E8754A]/20">
                          <DropdownMenuItem
                            onClick={() => handleBlockToggle(cAuthor.id as string, cAuthor.displayName ?? "User")}
                            className="text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider"
                          >
                            <Ban className="w-3 h-3 mr-2" /> {blockedUserIds.has(cAuthor.id) ? "Unblock" : "Block"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setReportReason("");
                              setReportTarget({ id: cAuthor.id as string, name: cAuthor.displayName ?? "User" });
                            }}
                            className="text-[#DC143C] hover:text-[#DC143C] text-xs font-bold uppercase tracking-wider"
                          >
                            <Flag className="w-3 h-3 mr-2" /> Report
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {cIsMine && (
                      <button
                        type="button"
                        onClick={() => {
                          // Hiding ("Go ghost") is the safer direction — fire
                          // immediately. Revealing exposes identity to the
                          // post owner via a fresh notification, so gate it
                          // behind a confirm dialog to prevent regret-clicks.
                          if (cIsAnon) {
                            setConfirmRevealCommentId(c.id);
                          } else {
                            handleToggleCommentAnon(c.id, cIsAnon);
                          }
                        }}
                        disabled={updateCommentAnon.isPending}
                        aria-label={cIsAnon ? "Reveal your identity on this comment" : "Hide your identity on this comment"}
                        className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/40 hover:text-[#E8754A] transition-colors disabled:opacity-50"
                      >
                        <Ghost className="w-2.5 h-2.5" />
                        {cIsAnon ? "Reveal" : "Go ghost"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <AlertDialog
        open={confirmRevealCommentId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRevealCommentId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reveal your identity on this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will show your name to everyone who can see this comment, including the post owner — and the post owner will get a fresh notification with your name on it. You can switch back to anonymous later, but anyone who already saw the reveal will know.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateCommentAnon.isPending}>
              Stay anonymous
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={updateCommentAnon.isPending}
              onClick={async () => {
                const id = confirmRevealCommentId;
                if (id === null) return;
                // Close the dialog optimistically so the user isn't blocked
                // on the network round-trip; the toast inside
                // handleToggleCommentAnon still fires on success/failure.
                setConfirmRevealCommentId(null);
                await handleToggleCommentAnon(id, true);
              }}
            >
              Reveal my name
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => setReportTarget(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-black border border-[#E8754A]/25 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-sm uppercase tracking-wider text-white/90">
                Report {reportTarget.name}
              </span>
              <button
                onClick={() => setReportTarget(null)}
                aria-label="Close report dialog"
                className="text-white/30 hover:text-white/70 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/50 mb-3 font-medium">
              Tell our moderators what's wrong. The user will also be blocked.
            </p>
            <Textarea
              autoFocus
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="What happened? (optional)"
              rows={4}
              maxLength={1000}
              className="resize-none bg-white/5 border-white/15 text-sm"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                onClick={() => setReportTarget(null)}
                className="bg-transparent border border-white/15 text-white/70 hover:bg-white/5 font-black uppercase tracking-wider text-[11px]"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const target = reportTarget;
                  try {
                    await reportUser.mutateAsync({
                      userId: target.id,
                      data: { reason: reportReason.trim() || undefined },
                    });
                    await queryClientForBlocks.invalidateQueries({ queryKey: getListMyBlocksQueryKey() });
                    toast({ title: "Reported", description: "Moderators will review. The user is now blocked." });
                    setReportTarget(null);
                  } catch {
                    toast({ title: "Could not submit", description: "Please try again.", variant: "destructive" });
                  }
                }}
                disabled={reportUser.isPending}
                className="bg-[#DC143C] hover:bg-[#ff3358] text-white font-black uppercase tracking-wider text-[11px]"
              >
                {reportUser.isPending ? "Submitting…" : "Report & block"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
