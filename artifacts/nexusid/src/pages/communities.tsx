import { useState } from "react";
import { Users, Plus, Search, Shield, Lock, ChevronRight, UserCheck, Zap } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useListCommunities,
  useJoinCommunity,
  useCreateCommunity,
  useListCircles,
  useRequestCircleAccess,
  useGetMe,
  useGetPowerScore,
} from "@workspace/api-client-react";
import type { Circle } from "@workspace/api-client-react";
import { useDebounce } from "@/lib/debounce";

const categoryColors: Record<string, string> = {
  technology: "text-blue-400 border-blue-500/18 bg-blue-500/6",
  business: "text-[#E8754A] border-[#E8754A]/18 bg-[#E8754A]/6",
  design: "text-purple-400 border-purple-500/18 bg-purple-500/6",
  science: "text-emerald-400 border-emerald-500/18 bg-emerald-500/6",
  arts: "text-pink-400 border-pink-500/18 bg-pink-500/6",
  health: "text-red-400 border-red-500/18 bg-red-500/6",
};

export default function CommunitiesPage() {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newCommunity, setNewCommunity] = useState({ name: "", description: "", category: "technology" });
  const debouncedQuery = useDebounce(query, 300);

  const { data, isLoading, refetch } = useListCommunities({ q: debouncedQuery || undefined });
  const joinMutation = useJoinCommunity();
  const createMutation = useCreateCommunity();

  const { data: me } = useGetMe();
  const { data: psData } = useGetPowerScore(me?.id ?? "");
  const myPowerScore = psData?.score ?? 0;

  const { data: circlesData, refetch: refetchCircles } = useListCircles({});
  const requestAccess = useRequestCircleAccess();

  const communities = data?.communities ?? [];
  const circles: Circle[] = (circlesData?.circles ?? []) as Circle[];

  const handleCreate = async () => {
    await createMutation.mutateAsync({ data: newCommunity });
    refetch();
    setCreateOpen(false);
    setNewCommunity({ name: "", description: "", category: "technology" });
  };

  const handleCircleRequest = async (circleId: number) => {
    await requestAccess.mutateAsync({ circleId });
    refetchCircles();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Networks & Rooms</div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Communities</h1>
        </div>
        <Button
          size="sm"
          className="bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px] hover:bg-[#E8754A]/90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Community
        </Button>
      </div>

      {/* Inner Circles Section — embedded inline */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-[#E8754A]" />
            <span className="text-[11px] font-black uppercase tracking-[0.15em] text-[#E8754A]">Inner Circles</span>
            <span className="text-[10px] text-white/30 font-bold">Invite-only power rooms</span>
          </div>
          <Link href="/circles" className="text-[10px] font-black text-[#E8754A]/55 hover:text-[#E8754A] uppercase tracking-wider transition-colors">
            All Circles →
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {circles.slice(0, 4).map((c: Circle) => {
            const meetsScore = myPowerScore >= c.minPowerScore;
            return (
              <div key={c.id} className="bg-black border border-[#E8754A]/15 p-3 flex items-center gap-3 hover:border-[#E8754A]/30 transition-colors">
                <div className="w-8 h-8 border border-[#E8754A]/25 flex items-center justify-center text-[#E8754A] font-black text-xs shrink-0 bg-[#E8754A]/5">
                  <Lock className="w-3.5 h-3.5 opacity-70" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-black text-white/85 truncate uppercase tracking-tight">{c.name}</div>
                  <div className="flex items-center gap-2 text-[9px] text-white/30 font-bold mt-0.5">
                    <span><Users className="w-2.5 h-2.5 inline mr-0.5" />{c.membersCount}/50</span>
                    {c.minPowerScore > 0 && (
                      <span className={meetsScore ? "text-[#E8754A]/55" : "text-[#DC143C]/55"}>
                        <Zap className="w-2.5 h-2.5 inline mr-0.5" />{c.minPowerScore}+
                      </span>
                    )}
                  </div>
                </div>
                {c.isMember ? (
                  <Link href="/circles" className="text-[9px] font-black text-[#E8754A]/65 border border-[#E8754A]/25 px-2 py-1 uppercase tracking-wider hover:border-[#E8754A]/50 transition-colors shrink-0 flex items-center gap-0.5">
                    Enter <ChevronRight className="w-2.5 h-2.5" />
                  </Link>
                ) : c.isPending ? (
                  <span className="text-[9px] font-black text-[#E8754A]/40 border border-[#E8754A]/15 px-2 py-1 uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                    <UserCheck className="w-2.5 h-2.5" /> Pending
                  </span>
                ) : !meetsScore ? (
                  <span className="text-[9px] font-black text-[#DC143C]/45 border border-[#DC143C]/12 px-2 py-1 uppercase tracking-wider shrink-0">
                    Score low
                  </span>
                ) : (
                  <button
                    onClick={() => handleCircleRequest(c.id)}
                    disabled={requestAccess.isPending}
                    className="text-[9px] font-black text-[#E8754A]/65 border border-[#E8754A]/25 px-2 py-1 uppercase tracking-wider hover:border-[#E8754A]/50 hover:text-[#E8754A] transition-colors shrink-0"
                  >
                    {c.isInviteOnly ? "Request" : "Join"}
                  </button>
                )}
              </div>
            );
          })}
          {circles.length === 0 && (
            <div className="col-span-2 text-center py-6 text-white/20 text-xs font-medium border border-[#E8754A]/8">
              No circles yet — <Link href="/circles" className="text-[#E8754A]/50 hover:text-[#E8754A] underline">found the first one</Link>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[#E8754A]/8 mb-5 pt-5">
        <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] mb-3">Open Communities</div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search communities..."
            className="pl-9 bg-black border-[#E8754A]/15 focus:border-[#E8754A]/45 text-white placeholder:text-white/25 font-medium"
          />
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-white/30 text-sm font-medium">Loading...</div>}

      {!isLoading && communities.length === 0 && (
        <div className="text-center py-12 text-white/30">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No communities found</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {communities.map((c: any) => (
          <div key={c.id} className="relative bg-black border border-[#E8754A]/10 hover:border-[#E8754A]/28 transition-colors flex flex-col group overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#E8754A]/35 group-hover:bg-[#E8754A]/65 transition-colors" />
            <div className="p-4 pl-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 border border-[#E8754A]/22 flex items-center justify-center text-[#E8754A] font-black text-sm shrink-0 bg-[#E8754A]/5 group-hover:border-[#E8754A]/45 transition-colors">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate text-white/90">{c.name}</div>
                  <div className="text-[10px] text-white/28 flex items-center gap-1.5 mt-0.5 font-bold uppercase tracking-wider">
                    <Users className="w-2.5 h-2.5" />
                    {c.membersCount ?? 0} members
                  </div>
                </div>
                <span className={`text-[10px] font-black px-1.5 py-0.5 border uppercase tracking-wider shrink-0 ${categoryColors[c.category] ?? "bg-white/5 text-white/40 border-white/10"}`}>
                  {c.category}
                </span>
              </div>
              <p className="text-xs text-white/38 flex-1 mb-3 leading-relaxed line-clamp-2">{c.description}</p>
              <Button
                size="sm"
                className={`w-full text-[11px] h-7 font-black uppercase tracking-wider ${
                  c.isMember
                    ? "bg-transparent border border-[#E8754A]/12 text-white/28 cursor-default"
                    : "bg-[#E8754A] text-black border-[#E8754A] hover:bg-[#E8754A]/90"
                }`}
                onClick={() => !c.isMember && joinMutation.mutateAsync({ communityId: Number(c.id) })}
                disabled={c.isMember}
              >
                {c.isMember ? (
                  <><Shield className="w-3 h-3 mr-1" /> Joined</>
                ) : (
                  "Join Community"
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/22">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-[#E8754A]">Create a Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newCommunity.name}
              onChange={(e) => setNewCommunity(c => ({ ...c, name: e.target.value }))}
              placeholder="Community Name"
              className="text-sm h-9 bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22"
            />
            <Textarea
              value={newCommunity.description}
              onChange={(e) => setNewCommunity(c => ({ ...c, description: e.target.value }))}
              placeholder="What's the mission of this community?"
              className="text-sm resize-none bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22"
              rows={3}
            />
            <select
              value={newCommunity.category}
              onChange={(e) => setNewCommunity(c => ({ ...c, category: e.target.value }))}
              className="w-full h-9 text-sm border border-[#E8754A]/18 bg-black text-white px-3 font-medium focus:outline-none focus:border-[#E8754A]/45"
            >
              {["technology", "business", "design", "science", "arts", "health"].map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleCreate}
            disabled={!newCommunity.name || createMutation.isPending}
            className="w-full bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider hover:bg-[#E8754A]/90"
          >
            {createMutation.isPending ? "Creating..." : "Create Community"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
