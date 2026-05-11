import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { Hash, Users, RefreshCw, Zap, TrendingUp, MessageCircle, Crown } from "lucide-react";
import { MobileFeedTopBar } from "@/components/app-layout";
import PowerBadge from "@/components/power-badge";
import { VerificationBadge } from "@/components/verification-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import PostCard from "@/components/post-card";
import {
  useListPosts,
  useGetTrendingPosts,
  useGetSuggestedUsers,
  useGetTrendingHashtags,
  useFollowUser,
  useGetDarkHorses,
  getGetPostCommentsQueryKey,
} from "@workspace/api-client-react";
import type { DarkHorse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedStream } from "@/hooks/use-feed-stream";

const PAGE_SIZE = 20;

export default function FeedPage() {
  const { user } = useUser();
  const [tab, setTab] = useState<"for-you" | "trending">("for-you");
  const [pages, setPages] = useState<any[][]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data: postsData, isLoading, isFetching } = useListPosts({ limit: PAGE_SIZE, offset });
  const { data: trendingData } = useGetTrendingPosts({});
  const { data: suggestedData } = useGetSuggestedUsers({});
  const { data: hashtagsData } = useGetTrendingHashtags();
  const { data: darkHorsesData } = useGetDarkHorses();
  const followUser = useFollowUser();

  const darkHorses = ((darkHorsesData?.horses ?? []) as DarkHorse[]).slice(0, 3);
  const [operator, setOperator] = useState<{ user: { id: string; displayName: string; username: string; avatarUrl: string | null }; powerScore: number; deltaScore: number } | null>(null);

  useEffect(() => {
    const bp = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    let cancelled = false;
    fetch(`${bp}/api/leaderboard/operator-of-the-week`).then(async (r) => {
      if (!r.ok || cancelled) return;
      const j = await r.json();
      if (!cancelled && j?.operator) setOperator(j.operator);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Subscribe to feed-level SSE so that when the user undoes a Soul Twin
  // comment within the 10-minute grace window, every open post-card on
  // this page drops the comment from its visible list immediately. We
  // invalidate the per-post comment query so any PostCard rendering that
  // post refetches; the post itself doesn't go away.
  const feedQueryClient = useQueryClient();
  useFeedStream(!!user, (ev) => {
    if (ev.type === "comment-removed") {
      feedQueryClient.invalidateQueries({
        queryKey: getGetPostCommentsQueryKey(ev.postId, {}),
      });
    }
  });

  // Reset pagination when switching tabs.
  useEffect(() => {
    setPages([]);
    setOffset(0);
    setHasMore(true);
  }, [tab]);

  // Append new page when query resolves (only for "for-you" — trending is single page).
  useEffect(() => {
    if (tab !== "for-you" || !postsData?.posts) return;
    setPages(prev => {
      const existingIds = new Set(prev.flat().map((p: any) => p.id));
      const next = postsData.posts.filter((p: any) => !existingIds.has(p.id));
      if (next.length === 0 && offset > 0) return prev;
      return offset === 0 ? [postsData.posts] : [...prev, next];
    });
    if (postsData.posts.length < PAGE_SIZE) setHasMore(false);
  }, [postsData, tab, offset]);

  const loadMore = () => {
    if (!hasMore || isFetching || tab !== "for-you") return;
    setOffset(o => o + PAGE_SIZE);
  };

  // IntersectionObserver-based infinite scroll.
  useEffect(() => {
    if (tab !== "for-you") return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab, hasMore, isFetching]);

  const posts = tab === "trending" ? (trendingData?.posts ?? []) : pages.flat();

  return (
    <>
      {/* Instagram-style mobile top bar */}
      <MobileFeedTopBar
        right={
          <Link href="/connect" className="text-white/65 hover:text-white transition-colors p-1 -mr-1">
            <MessageCircle className="w-6 h-6" strokeWidth={1.5} />
          </Link>
        }
      />
      {/* pt-[52px] on mobile offsets the fixed top bar */}
    <div className="max-w-4xl mx-auto px-4 pt-[52px] lg:pt-6 pb-6 grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-6">
      <div>
        {/* Compose bar */}
        <div className="glass p-4 mb-4 flex items-center gap-3 lift-3d">
          <div className="relative">
            <div className="absolute inset-0 bg-[#E8754A]/30 blur-md rounded-full" />
            <Avatar className="w-8 h-8 border border-[#E8754A]/30 relative">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="text-xs bg-gradient-to-br from-[#E8754A]/20 to-[#DC143C]/10 text-[#E8754A] font-bold">{user?.firstName?.[0] ?? "U"}</AvatarFallback>
            </Avatar>
          </div>
          <Link href="/create-post" className="flex-1 glass-subtle hover:border-[#E8754A]/40 hover:bg-[#E8754A]/5 px-3 py-2 text-sm text-white/35 cursor-pointer transition-all font-medium">
            What's your move today?
          </Link>
          <Link href="/create-post">
            <Button size="sm" className="text-[11px] shrink-0 bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider neon-gold hover:neon-gold-strong" style={{ backgroundSize: "200% 100%" }}>
              Post
            </Button>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex mb-4 glass">
          {(["for-you", "trending"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative flex-1 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${
                tab === t
                  ? "bg-gradient-to-b from-[#E8754A]/15 to-[#E8754A]/5 text-[#E8754A] neon-text-gold"
                  : "text-white/40 hover:text-[#E8754A]/80 hover:bg-[#E8754A]/3"
              }`}
            >
              {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#E8754A] shadow-[0_0_10px_rgba(232,117,74,0.8)]" />}
              {t === "for-you" ? "For You" : "🔥 Trending"}
            </button>
          ))}
        </div>

        {/* Posts */}
        <div>
          {isLoading && (
            <div className="glass flex items-center justify-center py-16 gap-2 text-[#E8754A]/60 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin drop-shadow-[0_0_6px_rgba(232,117,74,0.6)]" />
              <span className="neon-text-gold font-bold uppercase tracking-wider text-[11px]">Loading the feed...</span>
            </div>
          )}
          {!isLoading && posts.length === 0 && (
            <div className="glass text-center py-16 text-white/40 text-sm">
              <p className="mb-3 font-medium">No posts yet. Be the first.</p>
              <Link href="/create-post">
                <Button size="sm" className="bg-gradient-to-r from-[#E8754A] to-[#ffb48c] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px] neon-gold">
                  Post Something
                </Button>
              </Link>
            </div>
          )}
          {posts.map((post: any) => (
            <PostCard key={post.id} post={post} />
          ))}
          {tab === "for-you" && (
            <>
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />
              {hasMore && isFetching && (
                <div className="flex items-center justify-center py-6 gap-2 text-[#E8754A]/50 text-[11px] font-bold uppercase tracking-wider">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading more
                </div>
              )}
              {!hasMore && posts.length > 0 && (
                <div className="text-center py-6 text-white/22 text-[11px] font-bold uppercase tracking-wider">End of feed</div>
              )}
              {hasMore && !isFetching && posts.length > 0 && (
                <div className="text-center py-4">
                  <Button size="sm" onClick={loadMore} className="text-[11px] bg-transparent border border-[#E8754A]/25 text-[#E8754A]/70 hover:border-[#E8754A]/50 hover:text-[#E8754A] font-black uppercase tracking-wider">
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Trending hashtags */}
        {hashtagsData?.hashtags && hashtagsData.hashtags.length > 0 && (
          <div className="glass p-4 lift-3d">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-3.5 h-3.5 text-[#E8754A] drop-shadow-[0_0_6px_rgba(232,117,74,0.6)]" />
              <h3 className="font-black text-[10px] uppercase tracking-[0.15em] text-[#E8754A]">Trending</h3>
            </div>
            <div className="space-y-2.5">
              {hashtagsData.hashtags.map((h: any) => (
                <div key={h.tag} className="flex items-center justify-between">
                  <span className="text-sm text-[#E8754A]/80 hover:text-[#E8754A] cursor-pointer font-bold transition-colors">#{h.tag}</span>
                  <span className="text-[10px] text-white/30 font-medium">{h.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested users */}
        {suggestedData?.users && suggestedData.users.length > 0 && (
          <div className="glass p-4 lift-3d">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-3.5 h-3.5 text-[#E8754A] drop-shadow-[0_0_6px_rgba(232,117,74,0.6)]" />
              <h3 className="font-black text-[10px] uppercase tracking-[0.15em] text-[#E8754A]">Who to Follow</h3>
            </div>
            <div className="space-y-3">
              {suggestedData.users.map((u: any) => (
                <div key={u.id} className="flex items-center gap-2">
                  <Link href={`/profile/${u.id}`}>
                    <Avatar className="w-8 h-8 border border-[#E8754A]/20 cursor-pointer">
                      <AvatarImage src={u.avatarUrl} />
                      <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{u.displayName?.[0] ?? "U"}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${u.id}`} className="text-xs font-bold hover:text-[#E8754A] transition-colors truncate inline-flex items-center gap-1">{u.displayName}<VerificationBadge tier={u.verificationTier} /></Link>
                    <div className="text-[10px] text-white/30 font-medium flex items-center gap-2 flex-wrap">
                      <span>{u.followersCount ?? 0} followers</span>
                      <PowerBadge score={u.powerScore} rank={u.powerRank} showRank={true} size="xs" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="text-[10px] h-6 px-2 bg-transparent border border-[#E8754A]/25 text-[#E8754A]/70 hover:border-[#E8754A]/50 hover:text-[#E8754A] font-bold uppercase tracking-wider"
                    onClick={() => followUser.mutateAsync({ userId: u.id })}
                  >
                    Follow
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operator of the Week */}
        {operator && (
          <div className="glass border-[#E8754A]/30 p-4 lift-3d" style={{ boxShadow: "0 0 22px -4px rgba(232,117,74,0.28), 0 30px 60px -25px rgba(0,0,0,1)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-3.5 h-3.5 text-[#E8754A] drop-shadow-[0_0_6px_rgba(232,117,74,0.7)]" />
                <span className="text-[10px] font-black text-[#E8754A] uppercase tracking-[0.15em]">Operator of the Week</span>
              </div>
              <Link href="/leaderboard" className="text-[9px] font-black text-white/25 uppercase tracking-wider hover:text-white/50 transition-colors">
                Board →
              </Link>
            </div>
            <Link href={`/profile/${operator.user.id}`}>
              <div className="flex items-center gap-3 cursor-pointer group">
                <Avatar className="w-12 h-12 border border-[#E8754A]/35 shrink-0">
                  <AvatarImage src={operator.user.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-sm bg-[#E8754A]/15 text-[#E8754A] font-black">{operator.user.displayName?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-white/85 group-hover:text-[#E8754A] transition-colors truncate">{operator.user.displayName}</div>
                  <div className="text-[10px] text-white/40 truncate">@{operator.user.username}</div>
                  {operator.deltaScore > 0 && (
                    <div className="text-[10px] text-emerald-400 font-bold">+{operator.deltaScore} this week</div>
                  )}
                </div>
                <div className="text-sm font-black text-[#E8754A] tabular-nums">{operator.powerScore}</div>
              </div>
            </Link>
          </div>
        )}

        {/* Dark Horses mini-widget */}
        {darkHorses.length > 0 && (
          <div className="glass border-[#DC143C]/25 p-4 lift-3d" style={{ boxShadow: "0 0 20px -5px rgba(220,20,60,0.2), 0 30px 60px -25px rgba(0,0,0,1)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-[#DC143C]" />
                <span className="text-[10px] font-black text-[#DC143C] uppercase tracking-[0.15em]">Dark Horses</span>
              </div>
              <Link href="/leaderboard" className="text-[9px] font-black text-white/25 uppercase tracking-wider hover:text-white/50 transition-colors">
                See All →
              </Link>
            </div>
            <div className="space-y-2.5">
              {darkHorses.map((h: DarkHorse) => (
                <Link key={h.rank} href={`/profile/${h.user.id}`}>
                  <div className="flex items-center gap-2 cursor-pointer group">
                    <div className="text-[10px] font-black text-[#DC143C]/50 w-4 shrink-0">#{h.rank}</div>
                    <Avatar className="w-7 h-7 border border-[#DC143C]/20 shrink-0">
                      <AvatarImage src={h.user.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[9px] bg-[#DC143C]/10 text-[#DC143C] font-bold">{h.user.displayName?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors truncate">{h.user.displayName}</div>
                      {h.growthPercent > 0 && (
                        <div className="text-[9px] text-[#E8754A]/60 font-bold">+{h.growthPercent}% this week</div>
                      )}
                    </div>
                    <div className="text-[11px] font-black text-[#E8754A] tabular-nums">{h.powerScore}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Power tip */}
        <div className="glass holo-border p-4 scan-pulse">
          <div className="flex items-center gap-2 mb-2 relative">
            <Zap className="w-3.5 h-3.5 text-[#E8754A] drop-shadow-[0_0_6px_rgba(232,117,74,0.8)]" />
            <span className="text-[10px] font-black holo-text uppercase tracking-[0.15em]">Power Move</span>
          </div>
          <p className="text-[11px] text-white/55 leading-relaxed relative">Post consistently for 7 days to boost your Power Score and get featured on the Dark Horse Board.</p>
        </div>
      </div>
    </div>
    </>
  );
}
