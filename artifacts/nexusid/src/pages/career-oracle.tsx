import { useState } from "react";
import { Link } from "wouter";
import { Sparkles, TrendingUp, AlertTriangle, ChevronRight, Lightbulb, BarChart2, Copy, RefreshCw, Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSubscription, isPro } from "@/lib/use-subscription";
import { trackEvent } from "@/lib/analytics";
import {
  useGetCareerOracle,
  type CareerOracleResult,
  type CareerOracleResultRoadmapItem,
  type CareerOracleResultSkillGapsItem,
} from "@workspace/api-client-react";

const ROLE_EXAMPLES = [
  "VP of Engineering",
  "Lead Product Designer",
  "Chief Revenue Officer",
  "AI Research Scientist",
];

const priorityStyle: Record<string, string> = {
  high: "text-[#DC143C]",
  medium: "text-[#E8754A]",
  low: "text-white/38",
};

export default function CareerOraclePage() {
  const [targetRole, setTargetRole] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [experienceInput, setExperienceInput] = useState("");
  const [submittedRole, setSubmittedRole] = useState("");
  const [result, setResult] = useState<CareerOracleResult | null>(null);
  const { toast } = useToast();

  const oracle = useGetCareerOracle();
  const { data: sub } = useSubscription();
  const proAccess = isPro(sub);
  const billingEnabled = sub?.billingEnabled ?? false;

  const buildExperience = () => {
    return experienceInput
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [titlePart, ...rest] = line.split(" at ");
        const title = (titlePart ?? "").trim() || "Role";
        const company = rest.join(" at ").trim() || "Company";
        return { title, company, current: false, startDate: "" };
      });
  };

  const handleSubmit = async () => {
    if (!targetRole.trim() || oracle.isPending) return;
    if (billingEnabled && !proAccess) {
      trackEvent("upsell_blocked", { feature: "career_oracle_premium" });
      toast({ title: "Operator tier required", description: "Premium analysis is an Operator feature." });
      return;
    }
    setSubmittedRole(targetRole.trim());
    const skills = skillsInput.split(",").map(s => s.trim()).filter(Boolean);
    const experience = buildExperience();
    try {
      const res = await oracle.mutateAsync({ data: { targetRole, skills, experience } });
      setResult(res);
    } catch {
      toast({ title: "Oracle offline", description: "The analysis failed. Try again.", variant: "destructive" });
    }
  };

  const handleRunAgain = () => {
    setResult(null);
    setSubmittedRole("");
  };

  const handleCopy = async () => {
    if (!result) return;
    const text = [
      `Career Oracle Analysis — Target: ${submittedRole}`,
      "",
      "## Skill Gaps",
      ...result.skillGaps.map(g => `- [${g.priority}] ${g.skill}${g.resources.length ? ` — ${g.resources.join(", ")}` : ""}`),
      "",
      "## Roadmap",
      ...result.roadmap.map(r => `${r.step}. ${r.title} (${r.timeframe})\n   ${r.description}`),
      "",
      "## Suggested Roles",
      ...result.jobSuggestions.map(s => `- ${s}`),
      "",
      "## Market Trends",
      ...result.marketTrends.map(t => `- ${t}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied roadmap", description: "Pasted into your clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const isLoading = oracle.isPending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-8">
        <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Intelligence</div>
        <h1 className="text-2xl font-black uppercase tracking-tight mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Career Oracle</h1>
        <p className="terminal text-[10px] text-white/30">// AI-powered path analysis · No sugarcoating · Just truth</p>
      </div>

      {billingEnabled && !proAccess && (
        <div className="bg-gradient-to-br from-[#1a0a0a] to-[#0a0a0a] border border-[#E8754A]/35 p-5 mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#E8754A]/10 blur-3xl rounded-full pointer-events-none" />
          <div className="flex items-start gap-3 relative">
            <div className="w-10 h-10 flex items-center justify-center bg-[#E8754A]/15 border border-[#E8754A]/40 shrink-0">
              <Lock className="w-5 h-5 text-[#E8754A]" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E8754A] mb-1">Operator-only feature</div>
              <h3 className="text-base font-black uppercase mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Premium Career Analysis
              </h3>
              <p className="text-xs text-white/55 mb-3 leading-relaxed">
                Deep analysis with comparable-operator benchmarking, salary intelligence, and a 12-month strategic roadmap.
                Available on Operator ($19/mo) and Enterprise tiers.
              </p>
              <Link href="/pricing">
                <Button
                  onClick={() => trackEvent("subscribe_click", { source: "career_oracle_gate" })}
                  className="font-black bg-[#E8754A] text-black hover:bg-[#E8754A]/90 uppercase text-[10px] tracking-wider h-8"
                >
                  <Crown className="w-3.5 h-3.5 mr-1.5" />
                  Upgrade to Operator
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Input panel */}
      <div className={`bg-[#0f0f0f] border border-[#E8754A]/15 p-5 mb-6 ${billingEnabled && !proAccess ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="terminal text-[#E8754A]/40 text-[10px] mb-3">$ oracle --analyze --target="..." --skills="..."</div>
        <div className="space-y-2 mb-3">
          <Input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Target role (e.g. VP of Engineering)"
            className="terminal h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/42 text-white placeholder:text-white/22"
          />
          <Input
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            placeholder="Your current skills (comma-separated)"
            className="terminal h-9 text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/42 text-white placeholder:text-white/22"
          />
          <Textarea
            value={experienceInput}
            onChange={(e) => setExperienceInput(e.target.value)}
            placeholder={`Experience (one per line, e.g. "Senior Engineer at Acme")`}
            rows={3}
            className="resize-none terminal text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/42 text-white placeholder:text-white/22"
          />
          <Button
            onClick={handleSubmit}
            disabled={!targetRole.trim() || isLoading}
            className="w-full font-black bg-[#E8754A] text-black border-[#E8754A] hover:bg-[#E8754A]/90 uppercase text-[11px] tracking-wider"
          >
            {isLoading ? "Analyzing..." : "Run Analysis"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLE_EXAMPLES.map(r => (
            <button
              key={r}
              onClick={() => setTargetRole(r)}
              className="terminal text-[10px] px-2.5 py-1 border border-[#E8754A]/12 text-white/32 hover:text-[#E8754A]/65 hover:border-[#E8754A]/28 transition-colors flex items-center gap-1"
            >
              <ChevronRight className="w-2.5 h-2.5 shrink-0" />
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-[#0f0f0f] border border-[#E8754A]/12 p-6">
          <div className="terminal text-[10px] space-y-2 text-white/45">
            <div><span className="text-[#E8754A]/45">{">"}</span> Scanning professional landscape...</div>
            <div><span className="text-[#E8754A]/45">{">"}</span> Cross-referencing market data...</div>
            <div><span className="text-[#E8754A]/45">{">"}</span> Computing gap analysis...</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#E8754A]/45">{">"}</span>
              <span className="text-[#E8754A]">Generating intelligence</span>
              <span className="inline-flex gap-0.5 ml-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1 h-1 bg-[#E8754A] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !isLoading && (
        <div className="space-y-4">
          {/* Target confirmed */}
          <div className="bg-[#0f0f0f] border border-[#E8754A]/15 px-5 py-3 flex items-center gap-3">
            <div className="w-7 h-7 border border-[#E8754A]/25 flex items-center justify-center shrink-0 bg-[#E8754A]/4">
              <Sparkles className="w-3.5 h-3.5 text-[#E8754A]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="terminal text-[9px] text-[#E8754A]/45 uppercase tracking-[0.15em] font-black mb-0.5">Target Acquired</div>
              <div className="font-black text-sm uppercase tracking-tight text-white truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{submittedRole}</div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={handleCopy}
                aria-label="Copy roadmap to clipboard"
                className="h-7 bg-transparent border border-[#E8754A]/22 text-[#E8754A]/70 hover:border-[#E8754A]/45 hover:text-[#E8754A] font-black uppercase tracking-wider text-[10px] px-2"
              >
                <Copy className="w-3 h-3 mr-1" /> Copy
              </Button>
              <Button
                size="sm"
                onClick={handleRunAgain}
                aria-label="Run analysis again"
                className="h-7 bg-transparent border border-white/15 text-white/55 hover:border-white/30 hover:text-white font-bold uppercase tracking-wider text-[10px] px-2"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Run Again
              </Button>
            </div>
          </div>

          {/* Skill Gaps — Brutal Truth */}
          {result.skillGaps.length > 0 && (
            <div className="bg-[#0f0f0f] border border-[#DC143C]/18">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#DC143C]/12 bg-[#DC143C]/4">
                <AlertTriangle className="w-3.5 h-3.5 text-[#DC143C]" />
                <span className="terminal text-[9px] text-[#DC143C]/70 font-black uppercase tracking-[0.15em]">Critical Gaps — Brutal Truth</span>
              </div>
              <div className="p-4 space-y-3">
                {result.skillGaps.map((gap: CareerOracleResultSkillGapsItem, i: number) => (
                  <div key={i} className="border-b border-[#E8754A]/6 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="terminal text-[11px] font-black text-white/82">{gap.skill}</span>
                      <span className={`terminal text-[9px] font-black uppercase tracking-wider ${priorityStyle[gap.priority] ?? "text-white/38"}`}>
                        [{gap.priority}]
                      </span>
                    </div>
                    {gap.resources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {gap.resources.map((r: string) => (
                          <span key={r} className="terminal text-[9px] px-1.5 py-0.5 border border-[#E8754A]/10 text-[#E8754A]/45 uppercase tracking-wider">{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roadmap */}
          {result.roadmap.length > 0 && (
            <div className="bg-[#0f0f0f] border border-[#E8754A]/15">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E8754A]/12 bg-[#E8754A]/3">
                <TrendingUp className="w-3.5 h-3.5 text-[#E8754A]" />
                <span className="terminal text-[9px] text-[#E8754A]/55 font-black uppercase tracking-[0.15em]">Execution Roadmap</span>
              </div>
              <div className="p-4 space-y-0">
                {result.roadmap.map((step: CareerOracleResultRoadmapItem, i: number) => (
                  <div key={i} className="flex gap-3 pb-4 last:pb-0 relative">
                    {i < result.roadmap.length - 1 && (
                      <div className="absolute left-3.5 top-7 bottom-0 w-[1px] bg-[#E8754A]/10" />
                    )}
                    <div className="w-7 h-7 border border-[#E8754A]/25 flex items-center justify-center shrink-0 bg-black terminal text-[10px] font-black text-[#E8754A]/55">
                      {String(step.step).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="terminal text-[11px] font-black text-white/82">{step.title}</span>
                        {step.timeframe && (
                          <span className="terminal text-[9px] text-white/28 uppercase tracking-wider font-bold">[{step.timeframe}]</span>
                        )}
                      </div>
                      <p className="terminal text-[10px] text-white/40 leading-relaxed">{step.description}</p>
                      {step.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {step.skills.map((s: string) => (
                            <span key={s} className="terminal text-[9px] px-1.5 py-0.5 border border-[#E8754A]/10 text-[#E8754A]/45 uppercase tracking-wider">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job Suggestions */}
          {result.jobSuggestions.length > 0 && (
            <div className="bg-[#0f0f0f] border border-[#E8754A]/15">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E8754A]/12 bg-[#E8754A]/3">
                <Lightbulb className="w-3.5 h-3.5 text-[#E8754A]" />
                <span className="terminal text-[9px] text-[#E8754A]/55 font-black uppercase tracking-[0.15em]">Suggested Roles</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-2">
                {result.jobSuggestions.map((suggestion: string, i: number) => (
                  <div key={i} className="terminal text-[10px] text-white/55 border border-[#E8754A]/8 px-2.5 py-1.5 flex items-center gap-1.5">
                    <ChevronRight className="w-2.5 h-2.5 text-[#E8754A]/40 shrink-0" />
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market Trends */}
          {result.marketTrends.length > 0 && (
            <div className="bg-[#0f0f0f] border border-[#E8754A]/15">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#E8754A]/12 bg-[#E8754A]/3">
                <BarChart2 className="w-3.5 h-3.5 text-[#E8754A]" />
                <span className="terminal text-[9px] text-[#E8754A]/55 font-black uppercase tracking-[0.15em]">Market Intel</span>
              </div>
              <div className="p-4 space-y-2">
                {result.marketTrends.map((trend: string, i: number) => (
                  <div key={i} className="terminal text-[10px] text-white/50 flex items-start gap-2">
                    <span className="text-[#E8754A]/40 mt-0.5 shrink-0">{">"}</span>
                    {trend}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!submittedRole && !isLoading && (
        <div className="border border-[#E8754A]/8 p-10 text-center bg-[#0f0f0f]">
          <div className="w-10 h-10 border border-[#E8754A]/20 flex items-center justify-center mx-auto mb-4 bg-[#E8754A]/4">
            <Sparkles className="w-5 h-5 text-[#E8754A]/50" />
          </div>
          <p className="terminal text-[10px] text-white/28 leading-relaxed">
            {">"} Enter a target role above<br />
            {">"} The Oracle delivers your reality check
          </p>
        </div>
      )}
    </div>
  );
}
