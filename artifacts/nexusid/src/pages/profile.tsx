import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useMobileDrawer } from "@/components/app-layout";
import { usePageMeta } from "@/lib/use-page-meta";
import {
  ArrowLeft, MoreHorizontal, MoreVertical, Edit3, Check, X,
  Grid3X3, Activity as ActivityIcon, Info,
  Crown, MapPin, Globe, Calendar, Ghost, Eye, Zap, Link2, Heart, MessageSquare,
  ShieldAlert, ShieldOff, Camera,
} from "lucide-react";
import { ImageUploader } from "@/components/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useGetMe, useUpdateMe, useGetUserById, useGetUserByUsername,
  getGetUserByUsernameQueryKey, useGetUserPosts, useFollowUser,
  useUnfollowUser, useGetUserViews, useSetGhostMode, useGetPowerScore,
  useRecordGhostView, getGetMeQueryKey, getGetUserByIdQueryKey,
  useGetSuggestedUsers, useGetUserFollowers, useGetUserFollowing,
  getGetUserFollowersQueryKey, getGetUserFollowingQueryKey,
  useBlockUser, useUnblockUser, useReportUser, useListMyBlocks,
  getListMyBlocksQueryKey,
} from "@workspace/api-client-react";
import {
  PowerScoreDial, HoloAvatar, ActivityHeatmap, styleForRank,
  StreakChip, AchievementIcons,
} from "@/components/profile-hero-card";
import ProfileQR from "@/components/profile-qr";
import { VerificationBadge } from "@/components/verification-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ProfilePageProps {
  mine?: boolean;
}

type Tab = "grid" | "activity" | "about";

function IGStat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const inner = (
    <div className={cn("flex flex-col items-center gap-0.5", onClick && "cursor-pointer hover:opacity-75 transition-opacity")}>
      <span
        className="font-black text-white tabular-nums leading-tight"
        style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16 }}
      >
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </span>
      <span className="text-[11px] text-white/45 font-medium">{label}</span>
    </div>
  );
  return onClick ? <button onClick={onClick}>{inner}</button> : inner;
}

function FollowListModal({
  open, onClose, title, userId, type,
}: {
  open: boolean; onClose: () => void; title: string;
  userId: string; type: "followers" | "following";
}) {
  const { data: followersData } = useGetUserFollowers(userId, { query: { enabled: open && type === "followers", queryKey: getGetUserFollowersQueryKey(userId) } });
  const { data: followingData } = useGetUserFollowing(userId, { query: { enabled: open && type === "following", queryKey: getGetUserFollowingQueryKey(userId) } });
  const users = type === "followers" ? (followersData?.users ?? []) : (followingData?.users ?? []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-black border border-[#E8754A]/20 max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8754A]/12">
          <span className="font-black text-sm uppercase tracking-wider text-white/90">{title}</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {users.length === 0 ? (
            <div className="py-8 text-center text-white/30 text-sm">No {title.toLowerCase()} yet</div>
          ) : (
            users.map((u: any) => (
              <Link
                key={u.id}
                href={`/profile/${u.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#E8754A]/5 border-b border-white/4 transition-colors"
              >
                <Avatar className="w-9 h-9 border border-[#E8754A]/20 shrink-0">
                  <AvatarImage src={u.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">
                    {u.displayName?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white/85 truncate inline-flex items-center gap-1">{u.displayName}<VerificationBadge tier={u.verificationTier} /></div>
                  <div className="text-[11px] text-white/35 truncate">@{u.username}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PostThumb({ post, onClick }: { post: any; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="aspect-square bg-[#111] overflow-hidden relative group w-full block focus:outline-none"
    >
      {post.imageUrl ? (
        <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-start p-2.5 bg-[#0d0d0d] border-r border-b border-[#E8754A]/6">
          {post.mood && (
            <span className="text-base mr-1 leading-none shrink-0">{post.mood}</span>
          )}
          <p className="text-[10px] text-white/55 leading-snug line-clamp-5 text-left">{post.content}</p>
        </div>
      )}
      <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
        <span className="flex items-center gap-1 text-white text-xs font-black">
          <Heart className="w-3.5 h-3.5 fill-white" /> {post.likesCount ?? 0}
        </span>
        <span className="flex items-center gap-1 text-white text-xs font-black">
          <MessageSquare className="w-3.5 h-3.5 fill-white" /> {post.commentsCount ?? 0}
        </span>
      </div>
    </button>
  );
}

function SuggestedUserRow({ user }: { user: any }) {
  return (
    <Link href={`/profile/${user.id}`}>
      <div className="flex items-center gap-2.5 py-2 hover:opacity-80 transition-opacity cursor-pointer">
        <Avatar className="w-9 h-9 shrink-0">
          <AvatarImage src={user.avatarUrl} />
          <AvatarFallback className="bg-[#1a1a1a] text-[#E8754A] text-xs font-black">
            {user.displayName?.[0] ?? "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-white truncate leading-tight">{user.displayName}</p>
          <p className="text-[10px] text-white/40 truncate">@{user.username}</p>
        </div>
        <span className="text-[11px] font-black text-[#E8754A] hover:text-[#E8754A]/70 transition-colors uppercase tracking-wider shrink-0">
          Follow
        </span>
      </div>
    </Link>
  );
}

function ReportProfileDialog({
  open, onClose, onSubmit, isPending,
}: {
  open: boolean; onClose: () => void;
  onSubmit: (reason: string) => void; isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-black border border-[#E8754A]/25 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-black text-sm uppercase tracking-wider text-white/90">Report user</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-white/50 mb-3 font-medium">
          Tell our moderators what's wrong. The user will also be blocked.
        </p>
        <Textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What happened? (optional)"
          rows={4}
          maxLength={1000}
          className="resize-none bg-white/5 border-white/15 text-sm"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            onClick={onClose}
            className="bg-transparent border border-white/15 text-white/70 hover:bg-white/5 font-black uppercase tracking-wider text-[11px]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(reason.trim())}
            disabled={isPending}
            className="bg-[#DC143C] hover:bg-[#ff3358] text-white font-black uppercase tracking-wider text-[11px]"
          >
            {isPending ? "Submitting…" : "Report & block"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProfileActionsMenu({
  isBlocked, onBlock, onUnblock, onReport, busy,
}: {
  isBlocked: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  onReport: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="More actions"
        className="h-8 w-8 flex items-center justify-center bg-transparent border border-white/18 text-white/70 hover:border-white/35 hover:text-white transition-colors disabled:opacity-50"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 min-w-[180px] bg-black border border-[#E8754A]/25 shadow-xl">
          {isBlocked ? (
            <button
              onClick={() => { setOpen(false); onUnblock(); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/5 transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5" /> Unblock
            </button>
          ) : (
            <button
              onClick={() => { setOpen(false); onBlock(); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/5 transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5" /> Block
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onReport(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-[#DC143C]/90 hover:bg-[#DC143C]/10 transition-colors border-t border-white/8"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Report
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileMoreButton({ mine }: { mine?: boolean }) {
  const { openDrawer } = useMobileDrawer();
  if (!mine) return null;
  return (
    <button
      onClick={openDrawer}
      className="text-white/40 hover:text-white/70 transition-colors p-1 -mr-1"
      aria-label="Open menu"
    >
      <MoreHorizontal className="w-5 h-5" />
    </button>
  );
}

export default function ProfilePage({ mine }: ProfilePageProps) {
  const params = useParams<{ userId?: string; username?: string }>();
  const [, navigate] = useLocation();
  const userId = mine ? undefined : params.userId;
  const username = mine ? undefined : params.username;

  const { data: me, refetch: refetchMe } = useGetMe();
  const { data: otherUserById } = useGetUserById(userId ?? "", {
    query: { enabled: !!userId, queryKey: getGetUserByIdQueryKey(userId ?? "") },
  });
  const { data: otherUserByUsername } = useGetUserByUsername(username ?? "", {
    query: { enabled: !!username, queryKey: getGetUserByUsernameQueryKey(username ?? "") },
  });

  const profile = mine ? me : (otherUserById ?? otherUserByUsername);

  const { data: postsData } = useGetUserPosts(profile?.id ?? "", undefined, {
    query: { enabled: !!profile?.id, queryKey: ["getUserPosts", profile?.id ?? ""] },
  });
  const updateMe = useUpdateMe();
  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportUser = useReportUser();
  const { data: blocksData } = useListMyBlocks({
    query: { queryKey: getListMyBlocksQueryKey(), enabled: !mine },
  });
  const blockedIds = new Set(blocksData?.blockedUserIds ?? []);
  const [reportOpen, setReportOpen] = useState(false);

  const { data: viewsData } = useGetUserViews(profile?.id ?? "");
  const { data: powerScoreData } = useGetPowerScore(profile?.id ?? "");
  const { data: suggestedData } = useGetSuggestedUsers({ limit: 5 });
  const setGhostMode = useSetGhostMode();
  const recordGhostView = useRecordGhostView();

  usePageMeta({
    title: profile ? `${profile.displayName ?? profile.username} (@${profile.username}) — ORBN` : "Profile — ORBN",
    description: profile?.bio ?? "View this operator's profile, Power Score, and network on ORBN.",
    noIndex: !profile?.username,
  });

  const [tab, setTab] = useState<Tab>("grid");
  const [editing, setEditing] = useState(false);
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null);
  const [editForm, setEditForm] = useState({
    username: "", displayName: "", bio: "", location: "", website: "",
    occupation: "", gender: "", phone: "", email: "", avatarUrl: "", coverUrl: "",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getStoredGhostMode = () => {
    try { return localStorage.getItem("nexusid-ghost-mode") === "true"; } catch { return false; }
  };
  const [ghostOn, setGhostOn] = useState<boolean>(getStoredGhostMode);
  const [lastViewedId, setLastViewedId] = useState<string | null>(null);

  useEffect(() => {
    if (me?.ghostMode !== undefined && me.ghostMode !== ghostOn) {
      setGhostOn(me.ghostMode);
      try { localStorage.setItem("nexusid-ghost-mode", String(me.ghostMode)); } catch {}
    }
  }, [me?.ghostMode]);

  useEffect(() => {
    if (!mine && profile?.id && profile.id !== lastViewedId) {
      setLastViewedId(profile.id);
      recordGhostView.mutate({ userId: profile.id }, { onError: () => {} });
    }
  }, [profile?.id, mine, lastViewedId]);

  const rankName = powerScoreData?.rank ?? "RECRUIT";
  const rankStyle = styleForRank(rankName);
  const posts = postsData?.posts ?? [];
  const suggested = (suggestedData as any)?.users ?? [];

  const startEdit = () => {
    setEditForm({
      username: profile?.username ?? "",
      displayName: profile?.displayName ?? "",
      bio: profile?.bio ?? "",
      location: profile?.location ?? "",
      website: profile?.website ?? "",
      occupation: profile?.occupation ?? "",
      gender: profile?.gender ?? "",
      phone: profile?.phone ?? "",
      email: (profile as any)?.email ?? "",
      avatarUrl: profile?.avatarUrl ?? "",
      coverUrl: profile?.coverUrl ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      // Send explicit null for avatar/cover when cleared so the server resets
      // them and the profile falls back to its default look.
      const payload = {
        ...editForm,
        avatarUrl: editForm.avatarUrl === "" ? null : editForm.avatarUrl,
        coverUrl: editForm.coverUrl === "" ? null : editForm.coverUrl,
      };
      await updateMe.mutateAsync({ data: payload });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await refetchMe();
      setEditing(false);
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Save failed", description: "Try again.", variant: "destructive" });
    }
  };

  const isBlocked = profile ? blockedIds.has(profile.id) : false;
  const moderationBusy =
    blockUser.isPending || unblockUser.isPending || reportUser.isPending;

  const refreshAfterModeration = async () => {
    await queryClient.invalidateQueries({ queryKey: getListMyBlocksQueryKey() });
  };

  const handleBlock = async () => {
    if (!profile) return;
    try {
      await blockUser.mutateAsync({ userId: profile.id });
      await refreshAfterModeration();
      toast({ title: `Blocked @${profile.username}` });
    } catch {
      toast({ title: "Could not block user", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleUnblock = async () => {
    if (!profile) return;
    try {
      await unblockUser.mutateAsync({ userId: profile.id });
      await refreshAfterModeration();
      toast({ title: `Unblocked @${profile.username}` });
    } catch {
      toast({ title: "Could not unblock user", variant: "destructive" });
    }
  };

  const handleReport = async (reason: string) => {
    if (!profile) return;
    try {
      await reportUser.mutateAsync({
        userId: profile.id,
        data: { reason: reason || undefined },
      });
      // Reporting also blocks the user on the server side.
      await refreshAfterModeration();
      setReportOpen(false);
      toast({ title: "Report submitted", description: "Thanks — our moderators will review it." });
    } catch {
      toast({ title: "Could not submit report", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleFollow = async () => {
    if (!profile) return;
    const wasFollowing = profile.isFollowing;
    try {
      if (wasFollowing) {
        await unfollowUser.mutateAsync({ userId: profile.id });
      } else {
        await followUser.mutateAsync({ userId: profile.id });
      }
      await queryClient.invalidateQueries({ queryKey: getGetUserByIdQueryKey(profile.id) });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {
      toast({ title: wasFollowing ? "Unfollow failed" : "Follow failed", description: "Try again.", variant: "destructive" });
    }
  };

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-10 w-48 bg-white/4" />
        <div className="flex items-center gap-6 py-4">
          <Skeleton className="w-24 h-24 rounded-full bg-white/4 shrink-0 lg:w-36 lg:h-36" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-36 bg-white/4" />
            <div className="flex gap-6">
              <Skeleton className="h-8 w-16 bg-white/4" />
              <Skeleton className="h-8 w-16 bg-white/4" />
              <Skeleton className="h-8 w-16 bg-white/4" />
            </div>
            <Skeleton className="h-4 w-56 bg-white/4" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square bg-white/4" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-5xl mx-auto px-0 lg:px-4 lg:py-6">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-6 xl:items-start">

        {/* ─── CENTER COLUMN ─────────────────────────────────── */}
        <div className="min-w-0">

          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-[#E8754A]/12 sticky top-0 z-30 bg-black/90 backdrop-blur-sm">
            <button
              onClick={() => navigate(-1 as any)}
              className="text-white/55 hover:text-white/90 transition-colors -ml-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="font-black text-sm tracking-tight flex-1 truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              @{profile.username}
            </span>
            <ProfileMoreButton mine={mine} />
          </div>

          {/* ── Profile header ─── */}
          {editing ? (
            /* Edit form — slides in over profile */
            <div className="bg-black border-b border-[#E8754A]/15 px-4 lg:px-0 py-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E8754A]/70">Edit Profile</h2>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="text-[11px] h-7 bg-transparent border border-white/12 text-white/42 hover:border-white/28 font-bold uppercase tracking-wider"
                    onClick={() => setEditing(false)}
                  >
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-[11px] h-7 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider"
                    onClick={saveEdit}
                    disabled={updateMe.isPending}
                  >
                    <Check className="w-3 h-3 mr-1" /> Save
                  </Button>
                </div>
              </div>
              <div className="space-y-2.5 max-w-xl">
                {/* Username field with 6-month cooldown indicator */}
                {(() => {
                  const changedAt = profile?.usernameChangedAt ? new Date(profile.usernameChangedAt) : null;
                  const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000;
                  const nextAllowed = changedAt ? new Date(changedAt.getTime() + sixMonthsMs) : null;
                  const locked = nextAllowed ? new Date() < nextAllowed : false;
                  return (
                    <div className="space-y-1">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-sm select-none">@</span>
                        <Input
                          value={editForm.username}
                          onChange={(e) => !locked && setEditForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                          placeholder="username"
                          disabled={locked}
                          className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22 pl-7 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      {locked && nextAllowed && (
                        <p className="text-[10px] text-amber-500/70">Username locked until {nextAllowed.toLocaleDateString()} — changes allowed once every 6 months.</p>
                      )}
                      {!locked && (
                        <p className="text-[10px] text-white/25">3–30 chars · lowercase, numbers, underscores only · changeable once every 6 months</p>
                      )}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-2.5">
                  <Input value={editForm.displayName} onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Full Name" className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
                  <Input value={editForm.occupation} onChange={(e) => setEditForm(f => ({ ...f, occupation: e.target.value }))} placeholder="Occupation / Title" className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
                </div>
                <Textarea value={editForm.bio} onChange={(e) => setEditForm(f => ({ ...f, bio: e.target.value }))} placeholder="Bio — what's your angle?" className="text-sm resize-none bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" rows={3} />
                <div className="grid grid-cols-2 gap-2.5">
                  <Input value={editForm.location} onChange={(e) => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
                  <Input value={editForm.website} onChange={(e) => setEditForm(f => ({ ...f, website: e.target.value }))} placeholder="Website (https://…)" className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Input value={editForm.gender} onChange={(e) => setEditForm(f => ({ ...f, gender: e.target.value }))} placeholder="Gender (optional)" className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
                  <Input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone (private)" className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
                </div>
                <div>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Email (private)"
                    className="h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22"
                  />
                  <p className="text-[10px] text-white/25 mt-1">Stored privately — not shown on your public profile</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E8754A]/70">Profile Photo</p>
                    {editForm.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, avatarUrl: "" }))}
                        className="text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-red-400 transition-colors inline-flex items-center gap-1"
                        aria-label="Remove profile photo"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </div>
                  <ImageUploader
                    value={editForm.avatarUrl}
                    onChange={(url) => setEditForm(f => ({ ...f, avatarUrl: url }))}
                    label="Upload profile photo"
                    compact
                    visibility="public"
                    aspect="square"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E8754A]/70">Cover Image</p>
                    {editForm.coverUrl && (
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, coverUrl: "" }))}
                        className="text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-red-400 transition-colors inline-flex items-center gap-1"
                        aria-label="Remove cover image"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    )}
                  </div>
                  <ImageUploader
                    value={editForm.coverUrl}
                    onChange={(url) => setEditForm(f => ({ ...f, coverUrl: url }))}
                    label="Upload cover image"
                    maxSizeMb={10}
                    visibility="public"
                    aspect="wide"
                  />
                  <p className="text-[10px] text-white/25 mt-1">Wide banner shown above your profile · 1500×500 looks best</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pb-4">
              {/* ── Cover banner ── */}
              {profile.coverUrl ? (
                <div className="relative w-full h-32 lg:h-44 overflow-hidden bg-[#0a0a0a] border-b border-[#E8754A]/12">
                  <img
                    src={profile.coverUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                </div>
              ) : (
                <div
                  className="relative w-full h-20 lg:h-28 overflow-hidden border-b border-[#E8754A]/12"
                  style={{ background: `linear-gradient(135deg, #000 0%, #0a0a0a 50%, #000 100%)` }}
                >
                  <div
                    className="absolute inset-0 opacity-[0.07]"
                    style={{ backgroundImage: "repeating-linear-gradient(45deg, #E8754A 0px, #E8754A 1px, transparent 0px, transparent 28px)" }}
                  />
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{ background: `radial-gradient(circle at 80% 20%, ${rankStyle.glow}, transparent 60%)` }}
                  />
                </div>
              )}
              <div className="px-4 lg:px-0 pt-5">
              {/* ── Avatar + stats row (IG-style) ── */}
              <div className="flex items-center gap-5 lg:gap-10 mb-4">
                {/* Avatar */}
                <div className="shrink-0">
                  {/* Mobile: 86px; Desktop: 150px HoloAvatar */}
                  <div className="lg:hidden">
                    <div
                      className="w-20 h-20 rounded-full border-2 overflow-hidden"
                      style={{ borderColor: rankStyle.color, boxShadow: `0 0 14px ${rankStyle.glow}` }}
                    >
                      <Avatar className="w-full h-full">
                        <AvatarImage src={profile.avatarUrl ?? undefined} className="object-cover" />
                        <AvatarFallback className="text-xl bg-black font-black" style={{ color: rankStyle.color }}>
                          {profile.displayName?.[0] ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                  <div className="hidden lg:block">
                    <HoloAvatar
                      src={profile.avatarUrl ?? undefined}
                      fallback={profile.displayName?.[0] ?? "U"}
                      style={rankStyle}
                    />
                  </div>
                </div>

                {/* Stats + name (desktop) */}
                <div className="flex-1 min-w-0">
                  {/* Desktop username + actions row */}
                  <div className="hidden lg:flex items-center gap-3 mb-4 flex-wrap">
                    <span className="font-bold text-xl text-white/90">@{profile.username}</span>
                    {mine ? (
                      <button
                        onClick={startEdit}
                        className="flex items-center gap-1.5 text-[11px] h-8 px-4 bg-transparent border border-white/18 text-white/70 hover:border-white/35 hover:text-white font-bold uppercase tracking-wider transition-colors"
                      >
                        <Edit3 className="w-3 h-3" /> Edit Profile
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleFollow}
                          disabled={followUser.isPending || unfollowUser.isPending}
                          className={cn(
                            "text-[11px] h-8 px-4 font-black uppercase tracking-wider transition-colors",
                            profile.isFollowing
                              ? "bg-transparent border border-white/18 text-white/65 hover:border-[#DC143C]/45 hover:text-[#DC143C]"
                              : "bg-[#E8754A] text-black hover:bg-[#E8754A]/90"
                          )}
                        >
                          {profile.isFollowing ? "Following" : "Follow"}
                        </button>
                        <Link
                          href={`/messages?to=${profile.id}`}
                          className="flex items-center gap-1.5 text-[11px] h-8 px-4 bg-transparent border border-white/18 text-white/70 hover:border-white/35 font-bold uppercase tracking-wider transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" /> Message
                        </Link>
                        <ProfileActionsMenu
                          isBlocked={isBlocked}
                          onBlock={handleBlock}
                          onUnblock={handleUnblock}
                          onReport={() => setReportOpen(true)}
                          busy={moderationBusy}
                        />
                      </>
                    )}
                    {/* Rank badge */}
                    {powerScoreData && (
                      <span
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.15em] px-2 py-1 border"
                        style={{ color: rankStyle.color, borderColor: `${rankStyle.color}55`, background: `${rankStyle.color}10` }}
                      >
                        <Crown className="w-2.5 h-2.5" /> {rankName}
                      </span>
                    )}
                    {/* Chat screenshot warning chip */}
                    {((profile as any)?.chatScreenshotsTaken ?? 0) > 0 && (
                      <span
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.15em] px-2 py-1 border rounded-full"
                        style={{ color: "#DC143C", borderColor: "rgba(220,20,60,0.55)", background: "rgba(220,20,60,0.10)" }}
                        title="Number of times this user has screenshotted a DM thread"
                      >
                        <Camera className="w-2.5 h-2.5" /> {(profile as any).chatScreenshotsTaken} screenshot{(profile as any).chatScreenshotsTaken === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-5 lg:gap-8 mb-3 lg:mb-0">
                    <IGStat label="Posts" value={profile.postsCount ?? 0} />
                    <IGStat label="Followers" value={profile.followersCount ?? 0} onClick={() => setFollowModal("followers")} />
                    <IGStat label="Following" value={profile.followingCount ?? 0} onClick={() => setFollowModal("following")} />
                  </div>

                  {/* Bio — desktop only (mobile shows below) */}
                  <div className="hidden lg:block mt-4">
                    <p className="font-black text-white text-sm">{profile.displayName}</p>
                    {profile.occupation && (
                      <p className="text-[12px] text-[#E8754A]/80 font-bold mt-0.5 flex items-center gap-1">
                        <Crown className="w-3 h-3" /> {profile.occupation}
                      </p>
                    )}
                    {profile.bio && <p className="text-sm text-white/65 mt-1 leading-relaxed max-w-sm">{profile.bio}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
                      {profile.location && (
                        <span className="flex items-center gap-1 text-white/40">
                          <MapPin className="w-3 h-3" /> {profile.location}
                        </span>
                      )}
                      {profile.website && (
                        <a
                          href={profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[#E8754A]/70 hover:text-[#E8754A] transition-colors"
                        >
                          <Globe className="w-3 h-3" /> {profile.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {profile.createdAt && (
                        <span className="flex items-center gap-1 text-white/30">
                          <Calendar className="w-3 h-3" />
                          Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile: bio section */}
              <div className="lg:hidden mb-4">
                <p className="font-black text-white text-sm">{profile.displayName}</p>
                {profile.occupation && (
                  <p className="text-[11px] text-[#E8754A]/80 font-bold mt-0.5 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> {profile.occupation}
                  </p>
                )}
                {profile.bio && <p className="text-sm text-white/65 mt-1.5 leading-relaxed">{profile.bio}</p>}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
                  {profile.location && (
                    <span className="flex items-center gap-1 text-white/40">
                      <MapPin className="w-3 h-3" /> {profile.location}
                    </span>
                  )}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[#E8754A]/70 hover:text-[#E8754A]"
                    >
                      <Globe className="w-3 h-3" /> {profile.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              </div>

              {/* Mobile: action buttons */}
              <div className="lg:hidden flex gap-2 mb-4">
                {mine ? (
                  <>
                    <button
                      onClick={startEdit}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[11px] h-8 bg-transparent border border-white/18 text-white/70 hover:border-white/35 font-bold uppercase tracking-wider transition-colors"
                    >
                      <Edit3 className="w-3 h-3" /> Edit Profile
                    </button>
                    <ProfileQR
                      username={profile.username}
                      displayName={profile.displayName}
                      avatarUrl={profile.avatarUrl}
                      rank={rankName}
                      rankColor={rankStyle.color}
                    />
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleFollow}
                      disabled={followUser.isPending || unfollowUser.isPending}
                      className={cn(
                        "flex-1 text-[11px] h-8 font-black uppercase tracking-wider transition-colors",
                        profile.isFollowing
                          ? "bg-transparent border border-white/18 text-white/65"
                          : "bg-[#E8754A] text-black hover:bg-[#E8754A]/90"
                      )}
                    >
                      {profile.isFollowing ? "Following" : "Follow"}
                    </button>
                    <Link
                      href={`/messages?to=${profile.id}`}
                      className="flex-1 flex items-center justify-center text-[11px] h-8 bg-transparent border border-white/18 text-white/70 hover:border-white/35 font-bold uppercase tracking-wider transition-colors"
                    >
                      Message
                    </Link>
                    <ProfileActionsMenu
                      isBlocked={isBlocked}
                      onBlock={handleBlock}
                      onUnblock={handleUnblock}
                      onReport={() => setReportOpen(true)}
                      busy={moderationBusy}
                    />
                  </>
                )}
              </div>

              {/* Highlights row — skills + QR */}
              {((profile.skills && profile.skills.length > 0) || profile.username) && (
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none mb-3 lg:mb-0">
                  {/* Bounty highlight circle */}
                  {(profile.bountiesWon ?? 0) > 0 && (
                    <div className="lg:hidden shrink-0 flex flex-col items-center gap-1">
                      <div
                        className="w-14 h-14 rounded-full border-2 flex items-center justify-center bg-[#0a0a0a]"
                        style={{ borderColor: "#DC143C66" }}
                      >
                        <Zap className="w-5 h-5 text-[#DC143C]" />
                      </div>
                      <span className="text-[9px] text-white/30 font-medium">{profile.bountiesWon}W</span>
                    </div>
                  )}
                  {profile.skills?.map((skill: string) => (
                    <div key={skill} className="shrink-0 flex flex-col items-center gap-1">
                      <div
                        className="w-14 h-14 rounded-full border border-[#E8754A]/25 flex items-center justify-center bg-[#0a0a0a] text-[10px] font-black text-[#E8754A]/75 text-center leading-tight p-1"
                      >
                        {skill.slice(0, 6)}
                      </div>
                      <span className="text-[9px] text-white/30 font-medium truncate max-w-[56px] text-center">{skill}</span>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}

          {/* ── Tab bar ── */}
          <div className="border-t border-[#E8754A]/12 flex">
            {([
              { id: "grid" as Tab, icon: Grid3X3, label: "Posts" },
              { id: "activity" as Tab, icon: ActivityIcon, label: "Activity" },
              { id: "about" as Tab, icon: Info, label: "About" },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-colors border-t-2",
                  tab === id
                    ? "border-white text-white"
                    : "border-transparent text-white/30 hover:text-white/60"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          {tab === "grid" && (
            <div className="grid grid-cols-3 gap-px bg-[#1a1a1a]">
              {posts.length === 0 ? (
                <div className="col-span-3 py-16 text-center text-white/22 text-sm font-medium">
                  No posts yet
                </div>
              ) : (
                posts.map((post: any) => (
                  <PostThumb key={post.id} post={post} />
                ))
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="px-4 py-4">
              <ActivityHeatmap posts={posts} />
              {viewsData && (
                <div className="mt-4 flex gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Eye className="w-4 h-4 text-white/40" />
                    <span className="font-black text-white tabular-nums">{viewsData.identifiedViews}</span>
                    <span className="text-white/40 text-xs">profile views</span>
                  </div>
                  {mine && (
                    <div className="flex items-center gap-2 text-sm">
                      <Ghost className="w-4 h-4 text-white/25" />
                      <span className="font-black text-white/60 tabular-nums">{viewsData.ghostViews}</span>
                      <span className="text-white/25 text-xs">ghost views</span>
                    </div>
                  )}
                </div>
              )}
              {mine && (
                <button
                  onClick={async () => {
                    const next = !ghostOn;
                    setGhostOn(next);
                    try { localStorage.setItem("nexusid-ghost-mode", String(next)); } catch {}
                    await setGhostMode.mutateAsync({ data: { enabled: next } });
                  }}
                  className={cn(
                    "mt-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider px-3 py-2 border transition-colors",
                    ghostOn
                      ? "border-[#DC143C]/45 bg-[#DC143C]/8 text-[#DC143C]/85"
                      : "border-white/12 text-white/35 hover:border-white/25"
                  )}
                  aria-pressed={ghostOn}
                >
                  <Ghost className="w-3.5 h-3.5" />
                  Ghost Mode {ghostOn ? "On" : "Off"}
                </button>
              )}
            </div>
          )}

          {tab === "about" && (
            <div className="px-4 py-4 space-y-5">
              {/* Power score */}
              {powerScoreData && (
                <div className="bg-[#0d0d0d] border border-[#E8754A]/12 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-3.5 h-3.5 text-[#E8754A]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E8754A]/70">Power Score</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <PowerScoreDial
                      score={powerScoreData.score}
                      rank={powerScoreData.rank}
                      breakdown={powerScoreData.breakdown}
                      userId={profile?.id}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <StreakChip userId={profile?.id} />
                        <AchievementIcons userId={profile?.id} />
                      </div>
                      {([
                        { label: "Network", value: powerScoreData.breakdown.network, max: 300, color: "#60A5FA" },
                        { label: "Content", value: powerScoreData.breakdown.content, max: 300, color: "#E8754A" },
                        { label: "Activity", value: powerScoreData.breakdown.activity, max: 200, color: "#34D399" },
                        { label: "Reputation", value: powerScoreData.breakdown.reputation, max: 200, color: "#DC143C" },
                      ]).map(({ label, value, max, color }) => (
                        <div key={label}>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">{label}</span>
                            <span className="text-[9px] font-black tabular-nums" style={{ color }}>{value}</span>
                          </div>
                          <div className="h-1 bg-white/5 overflow-hidden">
                            <div
                              className="h-full transition-all duration-700"
                              style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Info chips */}
              <div className="space-y-2.5">
                {profile.occupation && (
                  <div className="flex items-center gap-2.5 text-sm text-white/65">
                    <Crown className="w-4 h-4 text-[#E8754A]/60 shrink-0" />
                    {profile.occupation}
                  </div>
                )}
                {profile.location && (
                  <div className="flex items-center gap-2.5 text-sm text-white/50">
                    <MapPin className="w-4 h-4 text-white/35 shrink-0" /> {profile.location}
                  </div>
                )}
                {profile.website && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <Globe className="w-4 h-4 text-[#E8754A]/50 shrink-0" />
                    <a href={profile.website} target="_blank" rel="noopener noreferrer"
                      className="text-[#E8754A]/70 hover:text-[#E8754A] transition-colors truncate">
                      {profile.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
                {profile.createdAt && (
                  <div className="flex items-center gap-2.5 text-sm text-white/35">
                    <Calendar className="w-4 h-4 shrink-0" />
                    Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </div>
                )}
                {mine && profile.phone && (
                  <div className="flex items-center gap-2.5 text-sm text-white/35">
                    <span className="text-[#E8754A]/50 shrink-0">☎</span> {profile.phone}
                  </div>
                )}
              </div>

              {/* Skills */}
              {profile.skills && profile.skills.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((s: string) => (
                      <span key={s} className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 border border-[#E8754A]/22 text-[#E8754A]/72">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bounties won */}
              {(profile.bountiesWon ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4 text-[#DC143C]" />
                  <span className="font-black text-[#DC143C]/85">{profile.bountiesWon} bounties won</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── RIGHT COLUMN (desktop xl+) ──────────────────────── */}
        <div className="hidden xl:block space-y-4 sticky top-6 self-start">

          {/* QR card */}
          <div className="bg-[#0d0d0d] border border-[#E8754A]/12 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E8754A]/55 mb-3">Share Profile</p>
            <div className="flex items-center gap-3">
              <ProfileQR
                username={profile.username}
                displayName={profile.displayName}
                avatarUrl={profile.avatarUrl}
                rank={rankName}
                rankColor={rankStyle.color}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{profile.displayName}</p>
                <p className="text-[10px] text-white/40 truncate">@{profile.username}</p>
                <p className="text-[9px] text-white/25 mt-1">Scan to view profile</p>
              </div>
            </div>
          </div>

          {/* Power Score card */}
          {powerScoreData && (
            <div className="bg-[#0d0d0d] border border-[#E8754A]/12 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-[#E8754A]" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E8754A]/70">Power Score</span>
              </div>
              <div className="flex justify-center mb-3">
                <PowerScoreDial
                  score={powerScoreData.score}
                  rank={powerScoreData.rank}
                  breakdown={powerScoreData.breakdown}
                  userId={profile?.id}
                />
              </div>
              <div className="flex items-center gap-1.5 justify-center mt-2 flex-wrap">
                <StreakChip userId={profile?.id} />
                <AchievementIcons userId={profile?.id} />
              </div>
              <div className="space-y-2 mt-4">
                {([
                  { label: "Network", value: powerScoreData.breakdown.network, max: 300, color: "#60A5FA" },
                  { label: "Content", value: powerScoreData.breakdown.content, max: 300, color: "#E8754A" },
                  { label: "Activity", value: powerScoreData.breakdown.activity, max: 200, color: "#34D399" },
                  { label: "Reputation", value: powerScoreData.breakdown.reputation, max: 200, color: "#DC143C" },
                ]).map(({ label, value, max, color }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[9px] font-black uppercase tracking-wider text-white/40">{label}</span>
                      <span className="text-[9px] font-black tabular-nums" style={{ color }}>{value}</span>
                    </div>
                    <div className="h-1 bg-white/5 overflow-hidden">
                      <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Views (mine only) */}
          {mine && viewsData && (
            <div className="bg-[#0d0d0d] border border-[#E8754A]/12 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-3">Profile Views</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-white/40" />
                  <span className="font-black text-white tabular-nums">{viewsData.identifiedViews}</span>
                  <span className="text-[10px] text-white/35">visible</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ghost className="w-4 h-4 text-white/25" />
                  <span className="font-black text-white/55 tabular-nums">{viewsData.ghostViews}</span>
                  <span className="text-[10px] text-white/25">ghost</span>
                </div>
              </div>
              <button
                onClick={async () => {
                  const next = !ghostOn;
                  setGhostOn(next);
                  try { localStorage.setItem("nexusid-ghost-mode", String(next)); } catch {}
                  await setGhostMode.mutateAsync({ data: { enabled: next } });
                }}
                className={cn(
                  "mt-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider px-3 py-2 border transition-colors w-full justify-center",
                  ghostOn
                    ? "border-[#DC143C]/45 bg-[#DC143C]/8 text-[#DC143C]/85"
                    : "border-white/12 text-white/35 hover:border-white/25"
                )}
              >
                <Ghost className="w-3.5 h-3.5" /> Ghost {ghostOn ? "On" : "Off"}
              </button>
            </div>
          )}

          {/* Suggested connections */}
          {suggested.length > 0 && (
            <div className="bg-[#0d0d0d] border border-[#E8754A]/12 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Suggested</p>
                <Link href="/explore">
                  <span className="text-[10px] text-[#E8754A]/60 hover:text-[#E8754A] font-bold uppercase tracking-wider transition-colors cursor-pointer">
                    See all
                  </span>
                </Link>
              </div>
              <div className="divide-y divide-[#E8754A]/6">
                {suggested.slice(0, 5).map((u: any) => (
                  <SuggestedUserRow key={u.id} user={u} />
                ))}
              </div>
            </div>
          )}

          {/* Copy link */}
          <button
            onClick={async () => {
              const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
              const url = `${window.location.origin}${basePath}/u/${profile.username}`;
              try {
                await navigator.clipboard.writeText(url);
                toast({ title: "Profile link copied" });
              } catch {
                toast({ title: "Copy failed", variant: "destructive" });
              }
            }}
            className="w-full flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider py-2.5 border border-white/10 text-white/35 hover:border-[#E8754A]/35 hover:text-[#E8754A]/65 transition-colors bg-transparent"
          >
            <Link2 className="w-3.5 h-3.5" /> Copy Link
          </button>
        </div>

      </div>
    </div>

    {/* Followers / Following modal */}
    {profile && (
      <FollowListModal
        open={followModal !== null}
        onClose={() => setFollowModal(null)}
        title={followModal === "followers" ? "Followers" : "Following"}
        userId={profile.id}
        type={followModal ?? "followers"}
      />
    )}

    {/* Report user dialog */}
    <ReportProfileDialog
      open={reportOpen}
      onClose={() => setReportOpen(false)}
      onSubmit={handleReport}
      isPending={reportUser.isPending}
    />
    </>
  );
}
