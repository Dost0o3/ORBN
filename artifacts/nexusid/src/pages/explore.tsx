import { useState } from "react";
import { Search, Users } from "lucide-react";
import { MobileFeedTopBar } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useSearchUsers, useFollowUser, useUnfollowUser } from "@workspace/api-client-react";
import { VerificationBadge } from "@/components/verification-badge";
import { useDebounce } from "@/lib/debounce";
import PowerBadge from "@/components/power-badge";

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading } = useSearchUsers({ q: debouncedQuery || undefined });
  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();

  const users = data?.users ?? [];

  return (
    <>
    <MobileFeedTopBar title="Explore" />
    <div className="max-w-2xl mx-auto px-4 pt-[52px] lg:pt-6 pb-6">
      <div className="mb-6">
        <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1 hidden lg:block">Discovery</div>
        <h1 className="text-2xl font-black uppercase tracking-tight mb-4 hidden lg:block">Find Operators</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or handle..."
            className="pl-9 bg-black border-[#E8754A]/20 focus:border-[#E8754A]/50 text-white placeholder:text-white/25 font-medium"
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-white/30 text-sm font-medium">Scanning the network...</div>
      )}

      {!isLoading && users.length === 0 && (
        <div className="text-center py-12 text-white/30">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">{query ? "No operators found" : "Start typing to search the network"}</p>
        </div>
      )}

      <div className="bg-black border border-[#E8754A]/12">
        {users.map((u: any, i: number) => (
          <div key={u.id} className={`flex items-center gap-3 p-4 ${i < users.length - 1 ? "border-b border-[#E8754A]/8" : ""} hover:bg-[#E8754A]/3 transition-colors`}>
            <Link href={`/profile/${u.id}`}>
              <Avatar className="w-10 h-10 border border-[#E8754A]/20 cursor-pointer">
                <AvatarImage src={u.avatarUrl} />
                <AvatarFallback className="text-sm bg-[#E8754A]/10 text-[#E8754A] font-bold">{u.displayName?.[0] ?? "U"}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/profile/${u.id}`} className="font-bold text-sm hover:text-[#E8754A] transition-colors truncate inline-flex items-center gap-1">{u.displayName}<VerificationBadge tier={u.verificationTier} /></Link>
                <PowerBadge score={u.powerScore} rank={u.powerRank} showRank={true} size="xs" />
              </div>
              <div className="text-[11px] text-white/30 font-medium">@{u.username}</div>
              {u.bio && <div className="text-xs text-white/40 mt-0.5 truncate">{u.bio}</div>}
              <div className="flex gap-3 mt-1">
                <span className="text-[10px] text-white/25 font-bold uppercase tracking-wider">{u.followersCount ?? 0} followers</span>
                <span className="text-[10px] text-white/25 font-bold uppercase tracking-wider">{u.postsCount ?? 0} posts</span>
              </div>
            </div>
            <Button
              size="sm"
              className={`text-[11px] h-7 shrink-0 font-black uppercase tracking-wider ${
                u.isFollowing
                  ? "bg-transparent border border-[#E8754A]/25 text-white/40 hover:border-[#DC143C]/40 hover:text-[#DC143C]/60"
                  : "bg-[#E8754A] text-black border-[#E8754A] hover:bg-[#E8754A]/90"
              }`}
              onClick={() => {
                if (u.isFollowing) {
                  unfollowUser.mutateAsync({ userId: u.id });
                } else {
                  followUser.mutateAsync({ userId: u.id });
                }
              }}
            >
              {u.isFollowing ? "Following" : "Follow"}
            </Button>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
