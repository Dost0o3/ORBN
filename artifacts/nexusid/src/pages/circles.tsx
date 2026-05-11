import { useState } from "react";
import { Lock, Plus, Users, Shield, X, ChevronRight, Send, Check, UserCheck, Clock, UserPlus, Image, FileText, Pencil } from "lucide-react";
import PowerBadge from "@/components/power-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useListCircles,
  useCreateCircle,
  useUpdateCircle,
  useRequestCircleAccess,
  useGetCirclePosts,
  useCreateCirclePost,
  useGetMe,
  useGetPowerScore,
  useGetCircleMembers,
  useGetCirclePending,
  useApproveCircleMember,
  useRejectCircleMember,
  useInviteCircleMember,
} from "@workspace/api-client-react";
import type { Circle, CirclePost, CircleMember } from "@workspace/api-client-react";

type CircleTab = "intel" | "members" | "pending";

export default function CirclesPage() {
  const { data: me } = useGetMe();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeCircle, setActiveCircle] = useState<Circle | null>(null);
  const [activeTab, setActiveTab] = useState<CircleTab>("intel");
  const [newCircle, setNewCircle] = useState({
    name: "",
    tagline: "",
    description: "",
    coverImageUrl: "",
    minPowerScore: 0,
    isInviteOnly: false,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editCircle, setEditCircle] = useState({ name: "", tagline: "", description: "", coverImageUrl: "" });
  const [newPost, setNewPost] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");

  const { data: psData } = useGetPowerScore(me?.id ?? "");
  const myPowerScore = psData?.score ?? 0;

  const { data, refetch } = useListCircles({});
  const createCircle = useCreateCircle();
  const updateCircle = useUpdateCircle();
  const requestAccess = useRequestCircleAccess();
  const createPost = useCreateCirclePost();
  const approveCircleMember = useApproveCircleMember();
  const rejectCircleMember = useRejectCircleMember();
  const inviteCircleMember = useInviteCircleMember();

  const { data: postsData, refetch: refetchPosts } = useGetCirclePosts(activeCircle?.id ?? 0);
  const circlePosts = postsData?.posts ?? [];

  const { data: membersData, refetch: refetchMembers } = useGetCircleMembers(activeCircle?.id ?? 0);
  const circleMembers = (membersData?.members ?? []) as CircleMember[];

  const { data: pendingData, refetch: refetchPending } = useGetCirclePending(activeCircle?.id ?? 0);
  const pendingMembers = (pendingData?.pending ?? []) as CircleMember[];

  const circles: Circle[] = (data?.circles ?? []) as Circle[];

  const isDon = activeCircle
    ? circles.find(c => c.id === activeCircle.id)?.creator?.id === me?.id
    : false;

  const handleCreate = async () => {
    await createCircle.mutateAsync({
      data: {
        name: newCircle.name,
        tagline: newCircle.tagline,
        description: newCircle.description || undefined,
        coverImageUrl: newCircle.coverImageUrl || undefined,
        minPowerScore: newCircle.minPowerScore,
        isInviteOnly: newCircle.isInviteOnly,
      },
    });
    refetch();
    setCreateOpen(false);
    setNewCircle({ name: "", tagline: "", description: "", coverImageUrl: "", minPowerScore: 0, isInviteOnly: false });
  };

  const handleRequest = async (circleId: number) => {
    await requestAccess.mutateAsync({ circleId });
    refetch();
  };

  const handlePost = async () => {
    if (!activeCircle || !newPost.trim()) return;
    await createPost.mutateAsync({ circleId: activeCircle.id, data: { content: newPost } });
    setNewPost("");
    refetchPosts();
  };

  const handleApprove = async (userId: string) => {
    if (!activeCircle) return;
    await approveCircleMember.mutateAsync({ circleId: activeCircle.id, userId });
    refetchPending();
    refetchMembers();
    refetch();
  };

  const handleReject = async (userId: string) => {
    if (!activeCircle) return;
    await rejectCircleMember.mutateAsync({ circleId: activeCircle.id, userId });
    refetchPending();
  };

  const handleInvite = async () => {
    if (!activeCircle || !inviteUserId.trim()) return;
    await inviteCircleMember.mutateAsync({ circleId: activeCircle.id, data: { userId: inviteUserId.trim() } });
    setInviteUserId("");
    refetchMembers();
    refetch();
  };

  const openEdit = (c: Circle) => {
    setEditCircle({
      name: c.name,
      tagline: c.tagline,
      description: c.description ?? "",
      coverImageUrl: c.coverImageUrl ?? "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!activeCircle) return;
    await updateCircle.mutateAsync({
      circleId: activeCircle.id,
      data: {
        name: editCircle.name || undefined,
        tagline: editCircle.tagline || undefined,
        description: editCircle.description || undefined,
        coverImageUrl: editCircle.coverImageUrl || undefined,
      },
    });
    setEditOpen(false);
    refetch();
    setActiveCircle(prev => prev ? {
      ...prev,
      name: editCircle.name || prev.name,
      tagline: editCircle.tagline || prev.tagline,
      coverImageUrl: editCircle.coverImageUrl || prev.coverImageUrl,
    } : null);
  };

  if (activeCircle) {
    const liveCircle = circles.find(c => c.id === activeCircle.id) ?? activeCircle;
    const tabs: { key: CircleTab; label: string; show: boolean }[] = [
      { key: "intel", label: "Intel Feed", show: true },
      { key: "members", label: `Members (${circleMembers.length})`, show: true },
      { key: "pending", label: `Pending (${pendingMembers.length})`, show: !!isDon },
    ];

    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Circle header with cover image */}
        <div className="mb-5">
          {liveCircle.coverImageUrl ? (
            <div className="relative mb-4 overflow-hidden" style={{ height: 140 }}>
              <img
                src={liveCircle.coverImageUrl}
                alt={liveCircle.name}
                className="w-full h-full object-cover"
                style={{ filter: "brightness(0.55)" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <button
                onClick={() => { setActiveCircle(null); setActiveTab("intel"); }}
                className="absolute top-3 left-3 text-white/60 hover:text-white/90 transition-colors bg-black/40 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                <div>
                  <h1 className="font-black text-xl uppercase tracking-tight leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {liveCircle.name}
                  </h1>
                  <div className="text-[10px] text-white/50 font-bold">{liveCircle.tagline}</div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                  <Shield className="w-3 h-3 text-[#E8754A]" />
                  <span>{liveCircle.membersCount} / 50</span>
                  {isDon && <span className="text-[#E8754A]/80 border border-[#E8754A]/35 px-1.5 py-0.5">DON</span>}
                  {isDon && (
                    <button onClick={() => openEdit(liveCircle)} className="text-white/30 hover:text-[#E8754A]/70 transition-colors ml-1">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => { setActiveCircle(null); setActiveTab("intel"); }} className="text-white/35 hover:text-white/70 transition-colors">
                <X className="w-4 h-4" />
              </button>
              <div>
                <h1 className="font-black text-lg uppercase tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {liveCircle.name}
                </h1>
                <div className="text-[10px] text-white/30 font-bold">{liveCircle.tagline}</div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-white/30 uppercase tracking-wider">
                <Shield className="w-3 h-3 text-[#E8754A]" />
                <span>{liveCircle.membersCount} / 50</span>
                {isDon && <span className="text-[#E8754A]/70 border border-[#E8754A]/30 px-1.5 py-0.5">DON</span>}
                {isDon && (
                  <button onClick={() => openEdit(liveCircle)} className="text-white/30 hover:text-[#E8754A]/70 transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#E8754A]/12 mb-4">
          {tabs.filter(t => t.show).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-colors relative ${
                activeTab === tab.key
                  ? "text-[#E8754A]"
                  : "text-white/30 hover:text-white/55"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#E8754A]" />
              )}
              {tab.key === "pending" && pendingMembers.length > 0 && (
                <span className="ml-1 bg-[#DC143C] text-white text-[8px] font-black px-1 py-0.5 inline-block">
                  {pendingMembers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Intel Feed */}
        {activeTab === "intel" && (
          <>
            {/* Pinned description/rules */}
            {liveCircle.description && (
              <div className="bg-[#E8754A]/5 border border-[#E8754A]/20 px-4 py-3 mb-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-3 h-3 text-[#E8754A]/60" />
                  <span className="text-[9px] font-black text-[#E8754A]/55 uppercase tracking-[0.15em]">Circle Rules / Description</span>
                </div>
                <p className="text-[12px] text-white/65 leading-relaxed">{liveCircle.description}</p>
              </div>
            )}

            <div className="bg-black border border-[#E8754A]/15 p-4 mb-4">
              <Textarea
                value={newPost}
                onChange={e => setNewPost(e.target.value)}
                placeholder="Share intel with the Circle..."
                rows={3}
                className="bg-transparent border-0 p-0 text-sm text-white placeholder:text-white/25 resize-none focus-visible:ring-0 mb-3"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handlePost}
                  disabled={!newPost.trim() || createPost.isPending}
                  className="bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[10px] h-7 px-3"
                >
                  <Send className="w-3 h-3 mr-1.5" /> Post
                </Button>
              </div>
            </div>

            <div className="bg-black border border-[#E8754A]/12 divide-y divide-[#E8754A]/8">
              {circlePosts.length === 0 && (
                <div className="text-center py-12 text-white/25 text-sm font-medium">No intel posted yet. Break the silence.</div>
              )}
              {(circlePosts as CirclePost[]).map((p: CirclePost) => (
                <div key={p.id} className="px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-6 h-6 border border-[#E8754A]/20">
                      <AvatarImage src={p.author?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[9px] bg-[#E8754A]/10 text-[#E8754A] font-bold">{p.author?.displayName?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] font-bold text-white/65">{p.author?.displayName}</span>
                    <PowerBadge score={p.author?.powerScore} rank={p.author?.powerRank} showRank={false} />
                    <span className="text-[9px] text-white/22 font-bold ml-auto">{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed">{p.content}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Member Roster with Power Scores + Don badge */}
        {activeTab === "members" && (
          <div className="bg-black border border-[#E8754A]/12 divide-y divide-[#E8754A]/8">
            {circleMembers.length === 0 && (
              <div className="text-center py-12 text-white/25 text-sm font-medium">No members yet.</div>
            )}
            {circleMembers.map((m: CircleMember) => (
              <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                <Avatar className="w-8 h-8 border border-[#E8754A]/20">
                  <AvatarImage src={m.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[10px] bg-[#E8754A]/10 text-[#E8754A] font-bold">{m.displayName?.[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-black text-white/80 truncate">{m.displayName ?? m.username ?? "Member"}</span>
                    {m.role === "don" && (
                      <span className="text-[8px] font-black text-[#E8754A] border border-[#E8754A]/40 px-1.5 py-0.5 uppercase tracking-wider shrink-0">DON</span>
                    )}
                  </div>
                  {m.username && <div className="text-[10px] text-white/30 font-bold">@{m.username}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <PowerBadge score={m.powerScore} rank={m.powerRank} showRank={true} size="xs" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DON: Pending Requests + Invite */}
        {activeTab === "pending" && isDon && (
          <div className="space-y-2">
            {/* Invite by User ID */}
            <div className="bg-black border border-[#E8754A]/15 p-3 mb-2 flex items-center gap-2">
              <UserPlus className="w-3.5 h-3.5 text-[#E8754A]/60 shrink-0" />
              <Input
                value={inviteUserId}
                onChange={e => setInviteUserId(e.target.value)}
                placeholder="Paste user ID to invite directly..."
                className="flex-1 h-7 text-[11px] bg-transparent border-0 p-0 text-white placeholder:text-white/25 focus-visible:ring-0"
              />
              <Button
                size="sm"
                onClick={handleInvite}
                disabled={!inviteUserId.trim() || inviteCircleMember.isPending}
                className="h-7 px-2.5 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[9px] shrink-0"
              >
                Invite
              </Button>
            </div>

            {pendingMembers.length === 0 && (
              <div className="text-center py-8 text-white/25 text-sm font-medium">No pending requests.</div>
            )}
            {pendingMembers.map((m: CircleMember) => (
              <div key={m.id} className="bg-black border border-[#E8754A]/15 px-4 py-3 flex items-center gap-3">
                <Avatar className="w-8 h-8 border border-[#E8754A]/20">
                  <AvatarImage src={m.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[10px] bg-[#E8754A]/10 text-[#E8754A] font-bold">{m.displayName?.[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-black text-white/80 truncate">{m.displayName ?? m.username ?? "User"}</div>
                  <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold mt-0.5 flex-wrap">
                    {m.username && <span>@{m.username}</span>}
                    <PowerBadge score={m.powerScore} rank={m.powerRank} showRank={true} size="xs" />
                    <span className="flex items-center gap-0.5 text-[#DC143C]/60"><Clock className="w-2.5 h-2.5" />Waiting</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 px-2.5 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[9px]"
                    onClick={() => handleApprove(m.id)}
                    disabled={approveCircleMember.isPending}
                  >
                    <Check className="w-3 h-3 mr-1" /> Admit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 border-[#DC143C]/30 text-[#DC143C]/65 hover:border-[#DC143C]/55 hover:text-[#DC143C] font-black uppercase tracking-wider text-[9px]"
                    onClick={() => handleReject(m.id)}
                    disabled={rejectCircleMember.isPending}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* DON: Edit Circle Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/25 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Edit Circle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              value={editCircle.name}
              onChange={e => setEditCircle(c => ({ ...c, name: e.target.value }))}
              placeholder="Circle name"
              className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25"
            />
            <Input
              value={editCircle.tagline}
              onChange={e => setEditCircle(c => ({ ...c, tagline: e.target.value }))}
              placeholder="Tagline"
              className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25"
            />
            <Textarea
              value={editCircle.description}
              onChange={e => setEditCircle(c => ({ ...c, description: e.target.value }))}
              placeholder="Circle rules & description (pinned at top of Intel feed)..."
              rows={4}
              className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25 resize-none text-[12px]"
            />
            <div className="flex items-center gap-2 bg-[#E8754A]/4 border border-[#E8754A]/12 px-3 py-2">
              <Image className="w-3.5 h-3.5 text-[#E8754A]/45 shrink-0" />
              <Input
                value={editCircle.coverImageUrl}
                onChange={e => setEditCircle(c => ({ ...c, coverImageUrl: e.target.value }))}
                placeholder="Cover image URL"
                className="bg-transparent border-0 p-0 text-[12px] text-white placeholder:text-white/25 focus-visible:ring-0 h-auto"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1 border-white/12 text-white/40 font-bold uppercase tracking-wider text-[11px]">Cancel</Button>
              <Button
                onClick={handleEdit}
                disabled={updateCircle.isPending}
                className="flex-1 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px]"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Invite-Only Rooms</div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <Lock className="w-5 h-5 text-[#E8754A]" />
            Inner Circles
          </h1>
        </div>
        <Button
          className="bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px] hover:bg-[#E8754A]/90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Found a Circle
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {circles.length === 0 && (
          <div className="col-span-2 text-center py-16 text-white/25 text-sm font-medium">
            No Circles exist yet. Be the first to found one.
          </div>
        )}
        {circles.map((c: Circle) => {
          const canEnter = c.isMember;
          const meetsScore = myPowerScore >= c.minPowerScore;
          const isMyCircle = c.creator?.id === me?.id;
          return (
            <div key={c.id} className="bg-black border border-[#E8754A]/15 hover:border-[#E8754A]/30 transition-colors overflow-hidden">
              {/* Cover image */}
              {c.coverImageUrl ? (
                <div className="relative" style={{ height: 90 }}>
                  <img
                    src={c.coverImageUrl}
                    alt={c.name}
                    className="w-full h-full object-cover"
                    style={{ filter: "brightness(0.5)" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  {isMyCircle && (
                    <span className="absolute top-2 right-2 text-[9px] font-black text-[#E8754A] border border-[#E8754A]/35 px-1.5 py-0.5 uppercase tracking-wider bg-black/60">DON</span>
                  )}
                </div>
              ) : (
                <div
                  className="relative flex items-center justify-center"
                  style={{ height: 56, background: "linear-gradient(135deg, #E8754A08 0%, #DC143C08 100%)" }}
                >
                  <Lock className="w-5 h-5 text-[#E8754A]/15" />
                  {isMyCircle && (
                    <span className="absolute top-2 right-2 text-[9px] font-black text-[#E8754A]/70 border border-[#E8754A]/30 px-1.5 py-0.5 uppercase tracking-wider">DON</span>
                  )}
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="font-black text-sm uppercase tracking-tight leading-tight flex-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {c.name}
                  </span>
                </div>
                <p className="text-[11px] text-white/42 italic mb-3 line-clamp-1">{c.tagline}</p>
                {c.description && (
                  <p className="text-[10px] text-white/30 leading-relaxed mb-3 line-clamp-2 border-l border-[#E8754A]/20 pl-2">{c.description}</p>
                )}
                <div className="flex items-center gap-3 text-[10px] text-white/30 font-bold mb-3">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.membersCount} / 50</span>
                  {c.minPowerScore > 0 && (
                    <span className={`flex items-center gap-1 ${meetsScore ? "text-[#E8754A]/55" : "text-[#DC143C]/65"}`}>
                      ⚡ {c.minPowerScore}+ required
                    </span>
                  )}
                  {c.isInviteOnly && <span className="text-white/25">Invite Only</span>}
                </div>
                {canEnter ? (
                  <Button
                    className="w-full bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[10px] h-7"
                    onClick={() => { setActiveCircle(c); setActiveTab("intel"); }}
                  >
                    Enter Circle <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                ) : c.isPending ? (
                  <div className="w-full text-center text-[10px] font-black text-[#E8754A]/45 uppercase tracking-wider py-1.5 border border-[#E8754A]/20">
                    <UserCheck className="w-3 h-3 inline mr-1" /> Request Pending
                  </div>
                ) : !meetsScore ? (
                  <div className="w-full text-center text-[10px] font-black text-[#DC143C]/55 uppercase tracking-wider py-1.5 border border-[#DC143C]/15">
                    Score too low ({myPowerScore} / {c.minPowerScore})
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full border-[#E8754A]/25 text-[#E8754A]/65 hover:border-[#E8754A]/50 hover:text-[#E8754A] font-black uppercase tracking-wider text-[10px] h-7"
                    onClick={() => handleRequest(c.id)}
                    disabled={requestAccess.isPending}
                  >
                    Request Access
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Circle Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/25 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Found an Inner Circle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              value={newCircle.name}
              onChange={e => setNewCircle(c => ({ ...c, name: e.target.value }))}
              placeholder="Circle name"
              className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25"
            />
            <Input
              value={newCircle.tagline}
              onChange={e => setNewCircle(c => ({ ...c, tagline: e.target.value }))}
              placeholder="Short tagline — make it sharp"
              className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25"
            />
            <Textarea
              value={newCircle.description}
              onChange={e => setNewCircle(c => ({ ...c, description: e.target.value }))}
              placeholder="Circle rules & description (pinned at top of Intel feed)..."
              rows={3}
              className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25 resize-none text-[12px]"
            />
            <div className="flex items-center gap-2 bg-[#E8754A]/4 border border-[#E8754A]/12 px-3 py-2">
              <Image className="w-3.5 h-3.5 text-[#E8754A]/45 shrink-0" />
              <Input
                value={newCircle.coverImageUrl}
                onChange={e => setNewCircle(c => ({ ...c, coverImageUrl: e.target.value }))}
                placeholder="Cover image URL (optional)"
                className="bg-transparent border-0 p-0 text-[12px] text-white placeholder:text-white/25 focus-visible:ring-0 h-auto"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-1.5 block">Minimum Power Score (0 = open to all)</label>
              <Input
                type="number"
                value={newCircle.minPowerScore}
                onChange={e => setNewCircle(c => ({ ...c, minPowerScore: parseInt(e.target.value) || 0 }))}
                placeholder="0"
                className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25"
                min={0}
                max={999}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newCircle.isInviteOnly}
                onChange={e => setNewCircle(c => ({ ...c, isInviteOnly: e.target.checked }))}
                className="w-3.5 h-3.5 accent-[#E8754A]"
              />
              <span className="text-[11px] font-bold text-white/55 uppercase tracking-wider">Invite Only</span>
            </label>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="flex-1 border-white/12 text-white/40 font-bold uppercase tracking-wider text-[11px]">Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={createCircle.isPending || !newCircle.name || !newCircle.tagline}
                className="flex-1 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px]"
              >
                Found It
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
