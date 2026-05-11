import { useState } from "react";
import { Target, Plus, Clock, Users, Check, ChevronRight, X, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useListBounties,
  useCreateBounty,
  useGetBountySubmissions,
  useCreateBountySubmission,
  useSelectBountyWinner,
  useCloseBounty,
  useGetMe,
} from "@workspace/api-client-react";
import type { Bounty, BountySubmission } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["All", "Design", "Code", "Strategy", "Research", "Marketing", "Legal", "Finance"];
const STATUSES = ["open", "claimed", "closed"] as const;

const statusStyle = {
  open: "text-[#E8754A] border-[#E8754A]/40 bg-[#E8754A]/8",
  claimed: "text-[#DC143C] border-[#DC143C]/40 bg-[#DC143C]/8",
  closed: "text-white/30 border-white/15 bg-white/4",
};

export default function BountiesPage() {
  const { data: me } = useGetMe();
  const [cat, setCat] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [newBounty, setNewBounty] = useState({ title: "", description: "", category: "Design", reward: "", deadline: "" });
  const [newSubmission, setNewSubmission] = useState({ content: "", link: "" });

  const { data, refetch } = useListBounties({ category: cat !== "All" ? cat : undefined });
  const createBounty = useCreateBounty();
  const createSub = useCreateBountySubmission();
  const selectWinner = useSelectBountyWinner();
  const closeBounty = useCloseBounty();

  const { data: subsData, refetch: refetchSubs } = useGetBountySubmissions(selectedBounty?.id ?? 0);
  const submissions: BountySubmission[] = (subsData?.submissions ?? []) as BountySubmission[];

  const bounties = data?.bounties ?? [];

  const { toast } = useToast();

  const handleCreate = async () => {
    try {
      await createBounty.mutateAsync({ data: { ...newBounty, deadline: newBounty.deadline || undefined } });
      refetch();
      setCreateOpen(false);
      setNewBounty({ title: "", description: "", category: "Design", reward: "", deadline: "" });
      toast({ title: "Bounty posted", description: "Operators will start submitting." });
    } catch {
      toast({ title: "Could not post bounty", description: "Try again.", variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!selectedBounty) return;
    try {
      await createSub.mutateAsync({ bountyId: selectedBounty.id, data: { content: newSubmission.content, link: newSubmission.link || undefined } });
      setSubmitOpen(false);
      setNewSubmission({ content: "", link: "" });
      refetchSubs();
      toast({ title: "Solution submitted" });
    } catch {
      toast({ title: "Submission failed", description: "Try again.", variant: "destructive" });
    }
  };

  const handleWinner = async (bountyId: number, submissionId: number) => {
    try {
      await selectWinner.mutateAsync({ bountyId, submissionId });
      refetch();
      refetchSubs();
      setSelectedBounty(b => b ? { ...b, status: "claimed" } : null);
      toast({ title: "Winner selected" });
    } catch {
      toast({ title: "Could not select winner", description: "Try again.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Professional Challenges</div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <Target className="w-6 h-6 text-[#DC143C]" />
            Bounty Board
          </h1>
        </div>
        <Button
          className="bg-[#DC143C] text-white border-[#DC143C] font-black uppercase tracking-wider text-[11px] hover:bg-[#DC143C]/90"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Post Bounty
        </Button>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider border transition-colors ${
              cat === c ? "bg-[#E8754A] text-black border-[#E8754A]" : "bg-black text-white/40 border-white/10 hover:border-[#E8754A]/30 hover:text-white/65"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {bounties.length === 0 && (
          <div className="col-span-2 text-center py-16 text-white/25 text-sm font-medium">
            No bounties posted yet. Be the first to post a challenge.
          </div>
        )}
        {bounties.map((b: Bounty) => (
          <div
            key={b.id}
            className="bg-black border border-[#E8754A]/15 p-4 cursor-pointer hover:border-[#E8754A]/35 transition-colors"
            onClick={() => setSelectedBounty(b)}
          >
            <div className="flex items-start justify-between mb-2">
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${statusStyle[b.status as keyof typeof statusStyle]}`}>
                {b.status}
              </span>
              <span className="text-[10px] font-black text-[#E8754A]/60 uppercase tracking-wider border border-[#E8754A]/15 px-2 py-0.5">
                {b.category}
              </span>
            </div>
            <h3 className="font-black text-sm uppercase tracking-tight mb-1.5 leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {b.title}
            </h3>
            <p className="text-[11px] text-white/42 leading-relaxed mb-3 line-clamp-2">{b.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Avatar className="w-5 h-5 border border-[#E8754A]/20">
                  <AvatarImage src={b.poster?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[8px] bg-[#E8754A]/10 text-[#E8754A]">{b.poster?.displayName?.[0]}</AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-white/35 font-bold">{b.poster?.displayName}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-white/30 font-bold">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b.submissionsCount}</span>
                {b.deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{b.deadline}</span>}
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E8754A]/8">
              <div className="text-[10px] font-black text-[#DC143C] uppercase tracking-wider">🎯 {b.reward}</div>
            </div>
          </div>
        ))}
      </div>

      {selectedBounty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-black border border-[#E8754A]/25 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8754A]/10">
              <h2 className="font-black text-sm uppercase tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{selectedBounty.title}</h2>
              <button onClick={() => setSelectedBounty(null)} className="text-white/30 hover:text-white/70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${statusStyle[selectedBounty.status as keyof typeof statusStyle]}`}>{selectedBounty.status}</span>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border border-[#E8754A]/20 text-[#E8754A]/60">{selectedBounty.category}</span>
              </div>
              <p className="text-sm text-white/58 leading-relaxed">{selectedBounty.description}</p>
              <div className="bg-[#DC143C]/8 border border-[#DC143C]/25 px-3 py-2">
                <div className="text-[10px] font-black text-[#DC143C] uppercase tracking-wider">🎯 Reward: {selectedBounty.reward}</div>
              </div>
              {selectedBounty.status === "open" && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-[#E8754A] text-black font-black uppercase tracking-wider text-[11px] hover:bg-[#E8754A]/90"
                    onClick={() => setSubmitOpen(true)}
                  >
                    Submit Your Solution <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                  {me?.id === selectedBounty.poster?.id && (
                    <Button
                      variant="outline"
                      className="border-white/15 text-white/35 hover:border-[#DC143C]/40 hover:text-[#DC143C]/70 font-black uppercase tracking-wider text-[10px]"
                      onClick={async () => {
                        await closeBounty.mutateAsync({ bountyId: selectedBounty.id });
                        refetch();
                        setSelectedBounty(b => b ? { ...b, status: "closed" } : null);
                      }}
                    >
                      Close
                    </Button>
                  )}
                </div>
              )}
              {submissions.length > 0 && (
                <div>
                  <div className="text-[10px] font-black text-[#E8754A]/55 uppercase tracking-[0.15em] mb-3">{submissions.length} Submissions</div>
                  <div className="space-y-2.5">
                    {submissions.map(s => (
                      <div key={s.id} className={`border p-3 ${s.isWinner ? "border-[#E8754A]/50 bg-[#E8754A]/5" : "border-white/8"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={s.submitter?.avatarUrl ?? undefined} />
                            <AvatarFallback className="text-[8px] bg-[#E8754A]/10 text-[#E8754A]">{s.submitter?.displayName?.[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-[10px] font-bold text-white/55">{s.submitter?.displayName}</span>
                          {s.isWinner && <span className="text-[9px] font-black text-[#E8754A] uppercase tracking-wider ml-auto">🏆 WINNER</span>}
                        </div>
                        <p className="text-[11px] text-white/55 leading-relaxed">{s.content}</p>
                        {s.link && (
                          <a href={s.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-[#E8754A]/60 hover:text-[#E8754A] mt-1.5 font-bold">
                            <LinkIcon className="w-3 h-3" />{s.link}
                          </a>
                        )}
                        {me?.id === selectedBounty.poster?.id && selectedBounty.status === "open" && !s.isWinner && (
                          <button
                            onClick={() => handleWinner(selectedBounty.id, s.id)}
                            className="mt-2 flex items-center gap-1 text-[10px] font-black text-[#E8754A]/55 hover:text-[#E8754A] uppercase tracking-wider"
                          >
                            <Check className="w-3 h-3" /> Select Winner
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/25 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Post a Bounty</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input value={newBounty.title} onChange={e => setNewBounty(b => ({ ...b, title: e.target.value }))} placeholder="Challenge title" className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25" />
            <Textarea value={newBounty.description} onChange={e => setNewBounty(b => ({ ...b, description: e.target.value }))} placeholder="Describe the problem you need solved..." rows={4} className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25 resize-none" />
            <select value={newBounty.category} onChange={e => setNewBounty(b => ({ ...b, category: e.target.value }))} className="w-full bg-black border border-[#E8754A]/20 text-white text-sm px-3 py-2 font-medium">
              {CATEGORIES.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}
            </select>
            <Input value={newBounty.reward} onChange={e => setNewBounty(b => ({ ...b, reward: e.target.value }))} placeholder="Reward (e.g. '50 Power Points', 'Revenue Share')" className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25" />
            <Input value={newBounty.deadline} onChange={e => setNewBounty(b => ({ ...b, deadline: e.target.value }))} placeholder="Deadline (e.g. 'Dec 31')" className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25" />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="flex-1 border-white/12 text-white/40 font-bold uppercase tracking-wider text-[11px]">Cancel</Button>
              <Button onClick={handleCreate} disabled={createBounty.isPending || !newBounty.title || !newBounty.description || !newBounty.reward} className="flex-1 bg-[#DC143C] text-white border-[#DC143C] font-black uppercase tracking-wider text-[11px]">
                Post Bounty
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/25 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Submit Solution</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Textarea value={newSubmission.content} onChange={e => setNewSubmission(s => ({ ...s, content: e.target.value }))} placeholder="Describe your solution..." rows={5} className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25 resize-none" />
            <Input value={newSubmission.link} onChange={e => setNewSubmission(s => ({ ...s, link: e.target.value }))} placeholder="Optional link (demo, doc, repo...)" className="bg-black border-[#E8754A]/20 text-white placeholder:text-white/25" />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setSubmitOpen(false)} className="flex-1 border-white/12 text-white/40 font-bold uppercase tracking-wider text-[11px]">Cancel</Button>
              <Button onClick={handleSubmit} disabled={createSub.isPending || !newSubmission.content} className="flex-1 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px]">
                Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
