import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Sparkles, Users, Target, FileText, Loader2, RefreshCcw } from "lucide-react";
import type { AgentScanResult } from "@/hooks/use-agent-scan";
import { useAgentScan } from "@/hooks/use-agent-scan";
import { useToast } from "@/hooks/use-toast";

interface Props {
  initial?: AgentScanResult | null;
}

export default function AgentForYouPanel({ initial }: Props) {
  const { toast } = useToast();
  const { run, loading, draftDm } = useAgentScan();
  const [data, setData] = useState<AgentScanResult | null>(initial ?? null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) setData(initial);
  }, [initial]);

  useEffect(() => {
    if (!data && !loading) {
      run().then(setData).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDraft = async (userId: string, name: string) => {
    setDrafting(userId);
    try {
      const draft = await draftDm(userId, `Skill overlap with ${name}`);
      setDrafts((prev) => ({ ...prev, [userId]: draft }));
    } catch {
      toast({ title: "Couldn't draft message", variant: "destructive" });
    } finally {
      setDrafting(null);
    }
  };

  return (
    <div className="border border-[#34D399]/25 bg-[#34D399]/3 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#34D399]" />
          <span className="text-[10px] font-black text-[#34D399] uppercase tracking-[0.15em]">For You · Agent Picks</span>
        </div>
        <button
          type="button"
          onClick={() => run().then(setData).catch(() => toast({ title: "Scan failed", variant: "destructive" }))}
          disabled={loading}
          aria-label="Refresh agent scan"
          className="h-6 px-2 text-[10px] font-black uppercase tracking-wider border border-[#34D399]/30 text-[#34D399]/80 hover:bg-[#34D399]/8 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
          Rescan
        </button>
      </div>

      {!data && loading && (
        <div className="text-[11px] text-white/45 italic">Scanning your network…</div>
      )}

      {data && (
        <>
          {data.connections.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/55">
                <Users className="w-3 h-3" /> Worth Connecting
              </div>
              {data.connections.map((c) => (
                <div key={c.userId} className="border border-white/8 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Link href={`/profile/${c.userId}`} className="text-xs font-bold text-white/80 hover:text-[#E8754A]">
                      {c.displayName}
                    </Link>
                    <button
                      type="button"
                      disabled={drafting === c.userId}
                      onClick={() => handleDraft(c.userId, c.displayName)}
                      className="h-6 px-2 text-[10px] font-black uppercase tracking-wider border border-[#E8754A]/30 text-[#E8754A]/80 hover:bg-[#E8754A]/8"
                    >
                      {drafting === c.userId ? <Loader2 className="w-3 h-3 animate-spin" /> : "Draft DM"}
                    </button>
                  </div>
                  <div className="text-[10px] text-white/45">{c.reason}</div>
                  {drafts[c.userId] && (
                    <pre className="text-[10px] text-white/65 whitespace-pre-wrap bg-black/40 p-2 border border-white/8 mt-1">{drafts[c.userId]}</pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.opportunities.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/55">
                <Target className="w-3 h-3" /> Opportunities
              </div>
              {data.opportunities.map((o) => (
                <div key={o.id} className="border border-white/8 p-2.5 space-y-1">
                  <div className="text-xs font-bold text-white/80">{o.title}</div>
                  <div className="text-[10px] text-white/45">{o.summary}</div>
                  {o.ctaUrl && (
                    <Link href={o.ctaUrl} className="text-[10px] font-black uppercase tracking-wider text-[#E8754A] hover:text-[#ffb48c]">
                      {o.cta ?? "Open →"}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.suggestedPosts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/55">
                <FileText className="w-3 h-3" /> Drafts in Your Voice
              </div>
              {data.suggestedPosts.map((p, i) => (
                <div key={i} className="border border-white/8 p-2.5 space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#E8754A]/80">{p.topic}</div>
                  <pre className="text-[11px] text-white/65 whitespace-pre-wrap leading-relaxed">{p.draft}</pre>
                </div>
              ))}
            </div>
          )}

          {data.connections.length === 0 && data.opportunities.length === 0 && data.suggestedPosts.length === 0 && (
            <div className="text-[11px] text-white/45 italic">No new picks right now. Try again later.</div>
          )}
        </>
      )}
    </div>
  );
}
