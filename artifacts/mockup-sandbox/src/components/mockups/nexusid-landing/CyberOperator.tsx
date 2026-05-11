import React, { useEffect, useState } from "react";
import { Brain, Zap, Lock, Flame, Network, Crown, ArrowRight, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./_group.css";

const features = [
  { icon: Brain, title: "AI Soul Twin", desc: "Your personal AI that learns your expertise, speaks your language, and negotiates on your behalf. Not a chatbot — your alter ego." },
  { icon: Crown, title: "Power Score", desc: "A reputation metric that cannot be faked. Built from your actual output — posts, deals closed, community impact, endorsements." },
  { icon: Lock, title: "Inner Circle", desc: "Invite-only encrypted rooms for serious operators. No spectators. No noise. Just people who move markets." },
  { icon: Flame, title: "Dark Horse Board", desc: "AI surfaces rising talent before they blow up. Be first. The leaderboard the industry actually watches." },
  { icon: Zap, title: "Career Oracle", desc: "AI-powered skill gap analysis and career roadmaps. Brutally honest. Surgically precise." },
  { icon: Network, title: "Bounty Board", desc: "Post a problem. Set a price. Get it solved. The professional marketplace LinkedIn was too corporate to build." },
];

const stats = [
  { value: "50K+", label: "Operators" },
  { value: "12K+", label: "Opportunities" },
  { value: "2.4K+", label: "Inner Circles" },
  { value: "98%", label: "AI Precision" },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    features: ["AI Feed Curation", "10 Soul Twin sessions/mo", "Join Communities", "Basic Job Board"],
    cta: "INIT_GUEST_SESSION",
    highlighted: false,
  },
  {
    name: "Operator",
    price: "$19",
    period: "/mo",
    features: ["Unlimited Soul Twin", "Career Oracle", "Inner Circle Rooms", "Power Score Boost", "Dark Horse Tracking"],
    cta: "ELEVATE_PRIVILEGES",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    features: ["Team Soul Twins", "Bulk Bounty Posting", "White-label Communities", "Custom Integrations", "Dedicated Strategist"],
    cta: "OPEN_COMM_CHANNEL",
    highlighted: false,
  },
];

export function CyberOperator() {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(`SYS.T: ${now.toISOString()}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="cyber-operator min-h-screen w-full relative overflow-x-hidden selection:bg-[#00FF9C] selection:text-black">
      {/* Global scanlines overlay */}
      <div className="scanlines"></div>

      {/* Grid Background */}
      <div className="fixed inset-0 data-grid opacity-30 z-0"></div>

      {/* Top Bar HUD */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-[#00FF9C]/30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Terminal className="w-5 h-5 text-accent" />
          <span className="font-display font-bold text-xl tracking-widest text-white glitch-hover cursor-default">
            NEXUS<span className="text-accent">ID</span>
          </span>
          <span className="hidden md:inline-block text-xs text-accent/50 ml-4 border border-accent/30 px-2 py-0.5">
            [ STATUS: ONLINE ]
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className="hidden md:inline-block text-xs text-accent/70 font-mono">
            {timeStr}
          </span>
          <a href="/sign-in">
            <button className="text-xs uppercase tracking-widest text-accent/70 hover:text-accent hover:underline decoration-accent underline-offset-4 transition-colors">
              &gt; Auth
            </button>
          </a>
          <a href="/sign-up">
            <button className="btn-cyber-solid px-4 py-1.5 text-xs">
              &gt; Execute
            </button>
          </a>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto flex flex-col gap-32">
        
        {/* HERO SECTION */}
        <section className="flex flex-col md:flex-row gap-12 items-center justify-between">
          <div className="flex-1 space-y-8">
            <div className="inline-block border border-accent/40 bg-accent/5 px-3 py-1 text-xs text-accent tracking-widest mb-4">
              // CLASSIFIED TERMINAL FOR ELITE OPERATORS
            </div>
            
            <h1 className="font-display text-5xl md:text-7xl font-bold text-white uppercase leading-[1.1] tracking-tight">
              The Network. <br/>
              <span className="text-accent">The Power.</span> <br/>
              The Move.
            </h1>
            
            <p className="text-accent/80 text-lg max-w-xl font-mono leading-relaxed">
              &gt; NexusID is the professional network for people who play to win. AI-powered. Reputation-driven. No noise — just signal.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <a href="/sign-up">
                <button className="btn-cyber-solid px-8 py-4 w-full sm:w-auto flex items-center justify-center gap-3">
                  INIT_SEQUENCE() <ArrowRight className="w-4 h-4" />
                </button>
              </a>
              <a href="/sign-in">
                <button className="btn-cyber px-8 py-4 w-full sm:w-auto">
                  [ ESTABLISH_LINK ]
                </button>
              </a>
            </div>
          </div>
          
          <div className="flex-1 w-full relative">
            <div className="hud-border p-6 bg-[#050505] shadow-[0_0_30px_rgba(0,255,156,0.1)]">
              <div className="text-xs text-accent/50 border-b border-accent/20 pb-2 mb-4 flex justify-between">
                <span>TERMINAL_OUTPUT</span>
                <span>$ ROOT</span>
              </div>
              <div className="space-y-3 text-sm text-accent/80">
                <p>&gt; Establishing secure connection...</p>
                <p>&gt; Bypassing corporate noise...</p>
                <p className="text-white">&gt; Authenticating operator...</p>
                <p>&gt; Loading Soul Twin architecture...</p>
                <p>&gt; <span className="blink text-accent">_</span></p>
              </div>
            </div>
          </div>
        </section>

        {/* ASCII DIVIDER */}
        <div className="w-full overflow-hidden text-accent/20 text-xs whitespace-nowrap select-none">
          ========================================================================================================================================================================================================
        </div>

        {/* STATS SECTION */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, idx) => (
            <div key={idx} className="hud-border p-6 flex flex-col items-center justify-center text-center bg-[#0a0a0a] group hover:bg-accent/5 transition-colors">
              <div className="text-3xl md:text-4xl font-display font-bold text-white group-hover:text-accent transition-colors mb-2">
                {s.value}
              </div>
              <div className="text-xs tracking-widest text-accent/60 uppercase">
                {s.label}
              </div>
            </div>
          ))}
        </section>

        {/* FEATURES GRID */}
        <section className="space-y-12">
          <div className="space-y-2">
            <div className="text-xs text-accent tracking-widest">// SYS.MODULES</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white uppercase">
              Weapons of the Trade
            </h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={i} className="hud-border p-6 bg-[#050505] hover:bg-[#0a0a0a] transition-colors relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 text-[10px] text-accent/30 font-mono">
                  [MOD_{i.toString().padStart(2, '0')}]
                </div>
                <div className="w-12 h-12 border border-accent/40 flex items-center justify-center mb-6 group-hover:border-accent group-hover:shadow-[0_0_15px_rgba(0,255,156,0.3)] transition-all">
                  <f.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-white font-display font-bold text-lg mb-3 uppercase tracking-wide">
                  {f.title}
                </h3>
                <p className="text-accent/60 text-sm leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ASCII DIVIDER */}
        <div className="w-full overflow-hidden text-accent/20 text-xs whitespace-nowrap select-none">
          --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
        </div>

        {/* PRICING SECTION */}
        <section className="space-y-12">
          <div className="space-y-2">
            <div className="text-xs text-accent tracking-widest">// SYS.CLEARANCE_LEVELS</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white uppercase">
              Choose Your Position
            </h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {tiers.map((t, i) => (
              <div key={i} className={`hud-border p-8 flex flex-col ${t.highlighted ? 'bg-accent/10 border-accent' : 'bg-[#050505]'}`}>
                {t.highlighted && (
                  <div className="absolute -top-3 left-4 bg-accent text-black px-2 py-0.5 text-xs font-bold tracking-widest uppercase">
                    RECOMMENDED
                  </div>
                )}
                
                <div className="text-xs text-accent/60 tracking-widest uppercase mb-4">
                  LVL: {t.name}
                </div>
                
                <div className="flex items-baseline gap-2 mb-8 border-b border-accent/20 pb-6">
                  <span className="text-4xl font-display font-bold text-white">{t.price}</span>
                  {t.period && <span className="text-accent/50 text-sm">{t.period}</span>}
                </div>
                
                <ul className="space-y-4 flex-1 mb-8">
                  {t.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-accent/80">
                      <span className="text-accent mt-0.5">&gt;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                
                <a href="/sign-up">
                  <button className={`w-full py-3 ${t.highlighted ? 'btn-cyber-solid' : 'btn-cyber'} text-xs`}>
                    {t.cta}
                  </button>
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* CTA FOOTER */}
        <section className="py-16 text-center hud-border bg-[#0a0a0a] relative overflow-hidden">
          <div className="absolute inset-0 data-grid opacity-20 pointer-events-none"></div>
          <div className="relative z-10 max-w-2xl mx-auto px-6">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white uppercase mb-6">
              The Network <span className="text-accent">Awaits</span>
            </h2>
            <p className="text-accent/70 mb-8 font-mono">
              &gt; Thousands of operators are already inside. Your seat is waiting.
            </p>
            <a href="/sign-up">
              <button className="btn-cyber-solid px-10 py-4 text-sm inline-flex items-center gap-3">
                CLAIM_IDENTITY() <ArrowRight className="w-4 h-4" />
              </button>
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-accent/20 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-accent/40">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <span className="font-display font-bold text-white">NEXUS<span className="text-accent">ID</span></span>
          </div>
          <div>
            &copy; 2026 NEXUSID_CORP. ALL_RIGHTS_RESERVED.
          </div>
        </footer>

      </main>
    </div>
  );
}

export default CyberOperator;
