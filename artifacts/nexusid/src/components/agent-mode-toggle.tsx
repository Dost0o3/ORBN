import { useEffect, useState } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAgentScan, fetchAgentStatus, type AgentScanResult } from "@/hooks/use-agent-scan";

interface AgentModeToggleProps {
  onScanResult?: (data: AgentScanResult) => void;
}

export default function AgentModeToggle({ onScanResult }: AgentModeToggleProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [autonomy, setAutonomy] = useState(false);
  const [consented, setConsented] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { run, loading, setAgentMode } = useAgentScan();

  useEffect(() => {
    let cancelled = false;
    fetchAgentStatus().then((s) => {
      if (cancelled || !s) return;
      setEnabled(s.agentModeEnabled);
      setAutonomy(s.agentAutonomyEnabled);
      setConsented(!!s.agentConsentedAt);
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    if (busy) return;
    if (!enabled && !consented) {
      setNeedsConsent(true);
      return;
    }
    setBusy(true);
    try {
      const next = !enabled;
      await setAgentMode(next, { autonomy: next ? autonomy : false, consent: consented });
      setEnabled(next);
      toast({ title: next ? "Agent Mode ON" : "Agent Mode OFF", description: next ? "Soul Twin will scan opportunities for you." : "Soul Twin paused." });
      if (next) {
        try {
          const r = await run();
          onScanResult?.(r);
        } catch {
          // already toasted on failure
        }
      }
    } catch {
      toast({ title: "Couldn't update Agent Mode", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleAutonomy = async () => {
    if (busy || !enabled) return;
    setBusy(true);
    try {
      const next = !autonomy;
      await setAgentMode(true, { autonomy: next, consent: consented });
      setAutonomy(next);
      toast({ title: next ? "Set & Forget ON" : "Set & Forget OFF" });
    } catch {
      toast({ title: "Couldn't update", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const acceptConsent = async () => {
    setBusy(true);
    try {
      await setAgentMode(true, { autonomy: false, consent: true });
      setConsented(true);
      setEnabled(true);
      setNeedsConsent(false);
      toast({ title: "Agent Mode activated", description: "Scanning for opportunities now…" });
      const r = await run();
      onScanResult?.(r);
    } catch {
      toast({ title: "Couldn't enable Agent Mode", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={enabled}
          aria-label="Agent Mode"
          className={`group relative h-7 px-2 flex items-center gap-1.5 border text-[10px] font-black uppercase tracking-wider transition-colors ${
            enabled
              ? "border-[#34D399]/55 text-[#34D399] bg-[#34D399]/8"
              : "border-[#E8754A]/22 text-[#E8754A]/65 hover:border-[#E8754A]/45 hover:text-[#E8754A]"
          }`}
          title={enabled ? "Agent Mode is on. Click to turn off." : "Turn Agent Mode on. Soul Twin will scan opportunities for you."}
        >
          {busy || loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
          Agent {enabled ? "ON" : "OFF"}
        </button>
        {enabled && (
          <button
            type="button"
            onClick={toggleAutonomy}
            disabled={busy}
            aria-pressed={autonomy}
            aria-label="Set and forget autonomy"
            className={`h-7 px-2 flex items-center gap-1.5 border text-[10px] font-black uppercase tracking-wider transition-colors ${
              autonomy
                ? "border-[#E8754A]/55 text-[#E8754A] bg-[#E8754A]/8"
                : "border-white/12 text-white/45 hover:border-white/24"
            }`}
            title="Set & Forget: when on, Soul Twin auto-follows new connections it finds. DMs, posts, and comments still wait for your approval in the queue."
          >
            <Sparkles className="w-3 h-3" />
            {autonomy ? "Auto" : "Manual"}
          </button>
        )}
      </div>

      {needsConsent && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0a0a0a] border border-[#E8754A]/35 p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#E8754A]">
              <Bot className="w-5 h-5" />
              <h2 className="font-black text-sm uppercase tracking-wider">Activate Agent Mode</h2>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              Your Soul Twin will start scanning opportunities, drafting messages, and surfacing high-value connections in your voice.
              Nothing gets sent without your approval. Turning on Set &amp; Forget lets Soul Twin auto-follow new connections it finds; DMs, posts, and comments still wait for your review in the queue.
            </p>
            <ul className="text-xs text-white/55 space-y-1.5 list-disc pl-4">
              <li>Reads your recent posts to learn your style</li>
              <li>Suggests connections, bounties, and post ideas daily</li>
              <li>Drafts DMs you can review before sending</li>
            </ul>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setNeedsConsent(false)}
                className="h-8 px-3 text-[11px] font-black uppercase tracking-wider border border-white/15 text-white/55 hover:text-white/80"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={acceptConsent}
                disabled={busy}
                className="h-8 px-3 text-[11px] font-black uppercase tracking-wider bg-[#E8754A] text-black border border-[#E8754A] hover:bg-[#E8754A]/90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
