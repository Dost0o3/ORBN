import { useState } from "react";
import { Search, MapPin, DollarSign, Briefcase, Star, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useListJobs, useGetAiJobMatches, useApplyToJob, useCreateJob } from "@workspace/api-client-react";
import { useDebounce } from "@/lib/debounce";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

const typeColors: Record<string, string> = {
  "full-time": "bg-[#DC143C]/10 text-[#DC143C] border-[#DC143C]/25",
  "part-time": "bg-[#E8754A]/10 text-[#E8754A] border-[#E8754A]/25",
  remote: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  contract: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export default function JobsPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "ai-match">("all");
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [newJob, setNewJob] = useState({ title: "", company: "", location: "", type: "full-time", description: "", skills: "" });

  const debouncedQuery = useDebounce(query, 300);
  const { data: jobsData, isLoading } = useListJobs({ q: debouncedQuery || undefined });
  const { data: aiData } = useGetAiJobMatches();
  const applyMutation = useApplyToJob();
  const createJob = useCreateJob();
  const { toast } = useToast();

  const jobs = tab === "ai-match" ? (aiData?.jobs ?? []) : (jobsData?.jobs ?? []);

  const handleApply = async () => {
    if (!selectedJob) return;
    try {
      await applyMutation.mutateAsync({ jobId: Number(selectedJob.id), data: { coverLetter } });
      setApplyOpen(false);
      setCoverLetter("");
      toast({ title: "Application sent", description: `Applied to ${selectedJob.title}` });
    } catch {
      toast({ title: "Application failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handlePost = async () => {
    try {
      await createJob.mutateAsync({
        data: {
          title: newJob.title,
          company: newJob.company,
          location: newJob.location,
          type: newJob.type as "full-time" | "part-time" | "remote" | "contract",
          description: newJob.description,
          skills: newJob.skills.split(",").map(s => s.trim()).filter(Boolean),
        }
      });
      setPostOpen(false);
      setNewJob({ title: "", company: "", location: "", type: "full-time", description: "", skills: "" });
      toast({ title: "Opportunity posted", description: "It's now live on The Board." });
    } catch {
      toast({ title: "Posting failed", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Opportunities</div>
          <h1 className="text-2xl font-black uppercase tracking-tight">The Board</h1>
        </div>
        <Button
          size="sm"
          className="bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider text-[11px] hover:bg-[#E8754A]/90"
          onClick={() => setPostOpen(true)}
        >
          Post a Job
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search opportunities..."
          className="pl-9 bg-black border-[#E8754A]/15 focus:border-[#E8754A]/45 text-white placeholder:text-white/25 font-medium"
        />
      </div>

      <div className="flex mb-4 border border-[#E8754A]/12 bg-black">
        {(["all", "ai-match"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-[0.1em] transition-colors flex items-center justify-center gap-1.5 ${
              tab === t
                ? "bg-[#E8754A]/6 text-[#E8754A] border-b-2 border-[#E8754A]"
                : "text-white/35 hover:text-white/65"
            }`}
          >
            {t === "ai-match" && <Star className="w-3 h-3" />}
            {t === "all" ? "All Jobs" : "AI Match"}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_360px] gap-4">
        <div className="bg-black border border-[#E8754A]/10">
          {isLoading && <div className="text-center py-12 text-white/30 text-sm font-medium">Loading opportunities...</div>}
          {!isLoading && jobs.length === 0 && (
            <div className="text-center py-12 text-white/30">
              <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No opportunities found</p>
            </div>
          )}
          {jobs.map((job: any, i: number) => (
            <button
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className={`w-full text-left p-4 transition-colors ${
                i < jobs.length - 1 ? "border-b border-[#E8754A]/6" : ""
              } ${
                selectedJob?.id === job.id
                  ? "bg-[#E8754A]/5 border-l-2 border-[#E8754A]"
                  : "hover:bg-[#E8754A]/2"
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="w-10 h-10 border border-[#E8754A]/15 shrink-0">
                  <AvatarImage src={job.poster?.avatarUrl} />
                  <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{job.company?.[0] ?? "C"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate text-white/90">{job.title}</div>
                  <div className="text-[11px] text-white/38 font-medium truncate">{job.company}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 border uppercase tracking-wider ${typeColors[job.type] ?? "bg-white/5 text-white/40 border-white/10"}`}>
                      {job.type}
                    </span>
                    <span className="text-[10px] text-white/28 flex items-center gap-0.5 font-medium">
                      <MapPin className="w-2.5 h-2.5" />{job.location}
                    </span>
                    {job.aiMatchScore && (
                      <span className="text-[10px] text-[#E8754A] font-black">{Math.round(job.aiMatchScore * 100)}% match</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/18 shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>

        {selectedJob ? (
          <div className="bg-black border border-[#E8754A]/15 p-5 h-fit sticky top-4">
            <div className="mb-4 pb-4 border-b border-[#E8754A]/8">
              <h2 className="font-black text-base uppercase tracking-tight text-white">{selectedJob.title}</h2>
              <div className="text-sm text-[#E8754A]/60 font-bold">{selectedJob.company}</div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`text-[10px] font-black px-2 py-0.5 border uppercase tracking-wider ${typeColors[selectedJob.type] ?? "bg-white/5 text-white/40 border-white/10"}`}>
                  {selectedJob.type}
                </span>
                <span className="text-[11px] text-white/32 flex items-center gap-1 font-medium">
                  <MapPin className="w-3 h-3" />{selectedJob.location}
                </span>
                {(selectedJob.salaryMin || selectedJob.salaryMax) && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold">
                    <DollarSign className="w-3 h-3" />
                    {selectedJob.salaryMin && `$${(selectedJob.salaryMin / 1000).toFixed(0)}k`}
                    {selectedJob.salaryMax && ` – $${(selectedJob.salaryMax / 1000).toFixed(0)}k`}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-white/50 mb-4">{selectedJob.description}</p>
            {selectedJob.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {selectedJob.skills.map((s: string) => (
                  <span key={s} className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-[#E8754A]/18 text-[#E8754A]/60 bg-[#E8754A]/4">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[10px] text-white/22 font-bold uppercase tracking-wider mb-4">{selectedJob.applicantsCount ?? 0} applicants</div>
            <Button
              size="sm"
              className="w-full h-10 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider hover:bg-[#E8754A]/90"
              onClick={() => setApplyOpen(true)}
            >
              Apply Now
            </Button>
          </div>
        ) : (
          <div className="hidden md:flex items-center justify-center text-white/20 text-sm font-medium border border-[#E8754A]/8 bg-black">
            Select an opportunity
          </div>
        )}
      </div>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/22">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-[#E8754A]">Apply — {selectedJob?.title}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            placeholder="Make your case. Be direct."
            className="resize-none text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22"
            rows={6}
          />
          <Button
            onClick={handleApply}
            disabled={!coverLetter.trim() || applyMutation.isPending}
            className="w-full bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider hover:bg-[#E8754A]/90"
          >
            {applyMutation.isPending ? "Submitting..." : "Submit Application"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent className="bg-black border border-[#E8754A]/22 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-[#E8754A]">Post an Opportunity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={newJob.title} onChange={(e) => setNewJob(j => ({ ...j, title: e.target.value }))} placeholder="Job Title" className="text-sm h-9 bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
            <Input value={newJob.company} onChange={(e) => setNewJob(j => ({ ...j, company: e.target.value }))} placeholder="Company" className="text-sm h-9 bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
            <Input value={newJob.location} onChange={(e) => setNewJob(j => ({ ...j, location: e.target.value }))} placeholder="Location" className="text-sm h-9 bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
            <select
              value={newJob.type}
              onChange={(e) => setNewJob(j => ({ ...j, type: e.target.value }))}
              className="w-full h-9 text-sm border border-[#E8754A]/18 bg-black text-white px-3 font-medium focus:outline-none focus:border-[#E8754A]/45"
            >
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="remote">Remote</option>
              <option value="contract">Contract</option>
            </select>
            <Textarea value={newJob.description} onChange={(e) => setNewJob(j => ({ ...j, description: e.target.value }))} placeholder="What's the mission?" className="text-sm resize-none bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" rows={4} />
            <Input value={newJob.skills} onChange={(e) => setNewJob(j => ({ ...j, skills: e.target.value }))} placeholder="Required skills (comma-separated)" className="text-sm h-9 bg-black border-[#E8754A]/18 focus:border-[#E8754A]/45 text-white placeholder:text-white/22" />
          </div>
          <Button
            onClick={handlePost}
            disabled={!newJob.title || createJob.isPending}
            className="w-full bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider hover:bg-[#E8754A]/90"
          >
            {createJob.isPending ? "Posting..." : "Post Opportunity"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
