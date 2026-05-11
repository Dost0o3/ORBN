import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Brain, Zap, Lock, Flame, Network, Crown, ArrowRight, Check } from "lucide-react";
import NeuralBackground from "@/components/neural-background";
import { usePageMeta } from "@/lib/use-page-meta";

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
    cta: "Enter the Network",
    highlighted: false,
  },
  {
    name: "Operator",
    price: "$19",
    period: "/mo",
    features: ["Unlimited Soul Twin", "Career Oracle", "Inner Circle Rooms", "Power Score Boost", "Dark Horse Tracking"],
    cta: "Claim Your Seat",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    features: ["Team Soul Twins", "Bulk Bounty Posting", "White-label Communities", "Custom Integrations", "Dedicated Strategist"],
    cta: "Make Contact",
    highlighted: false,
  },
];

const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function LandingPage() {
  usePageMeta({
    title: "ORBN — The Network. The Power. The Move.",
    description: "AI-powered professional network for operators who play to win. Power Score, Inner Circles, Soul Twin AI, Bounty Board.",
    canonical: "https://nexusid.app/",
  });
  return (
    <div className="min-h-screen text-white flex flex-col overflow-x-hidden relative" style={{ fontFamily: "'Inter', sans-serif" }}>
      <NeuralBackground />
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-[#E8754A]/25">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2.5 relative">
            <div className="relative">
              <div className="absolute inset-0 bg-[#E8754A]/40 blur-md" />
              <img src={`${basePath}/orbn-logo.png`} alt="ORBN" className="w-7 h-7 relative z-10 object-contain" />
            </div>
            <span className="font-black text-base tracking-tight holo-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              ORBN
            </span>
          </div>
          <div className="flex-1" />
          <Link href="/sign-in">
            <Button variant="ghost" size="sm" className="text-sm font-semibold text-white/50 hover:text-[#E8754A] hover:bg-[#E8754A]/8 border-transparent uppercase tracking-wider">
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="text-sm font-black bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] text-black border-[#E8754A] hover:neon-gold-strong px-5 uppercase tracking-wider neon-gold" style={{ backgroundSize: "200% 100%" }}>
              Enter
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-24 px-6 relative z-10">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.9] mb-6 italic" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <span className="holo-text neon-text-gold">THE NETWORK.</span><br />
            <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">THE POWER.</span><br />
            <span className="holo-text neon-text-gold">THE MOVE.</span>
          </h1>
          <div className="inline-flex items-center gap-2 px-4 py-2 glass-subtle text-[#E8754A] text-[10px] font-black tracking-[0.2em] uppercase mb-10 holo-border">
            <span className="w-1.5 h-1.5 bg-[#E8754A] pulse-ring" />
            <span className="relative">Your Network. Your Empire.</span>
          </div>
          <p className="text-xl text-white/55 max-w-2xl mx-auto mb-12 leading-relaxed font-normal">
            ORBN is the professional network for people who play to win. AI-powered. Reputation-driven. No noise — just signal.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/sign-up">
              <Button size="lg" className="group relative font-black text-base px-10 h-12 bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] text-black border-[#E8754A] tracking-tight uppercase neon-gold-strong overflow-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif", backgroundSize: "200% 100%", animation: "holo-shift 4s ease infinite" }}>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <span className="relative">Enter ORBN</span><ArrowRight className="ml-2 w-4 h-4 relative" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" size="lg" className="font-bold text-base px-10 h-12 glass border-[#E8754A]/25 text-white/70 hover:text-[#E8754A] hover:border-[#E8754A]/55 uppercase tracking-tight">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* Stats */}
      <section className="py-14 relative z-10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px glass-strong p-px">
            {stats.map(s => (
              <div key={s.label} className="text-center py-6 px-4 bg-black/40 hover:bg-[#E8754A]/5 transition-all duration-300 group">
                <div className="text-4xl font-black holo-text tabular-nums neon-text-gold group-hover:scale-110 transition-transform duration-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{s.value}</div>
                <div className="text-[10px] text-white/45 mt-1.5 uppercase tracking-[0.15em] font-bold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16">
            <div className="text-[10px] text-[#E8754A]/70 font-black tracking-[0.2em] uppercase mb-3 neon-text-gold">Weapons of the Trade</div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Built Different.<br /><span className="holo-text">By Design.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(f => (
              <div key={f.title} className="glass p-6 lift-3d group relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-24 h-24 bg-[#E8754A]/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-10 h-10 glass-subtle border border-[#E8754A]/30 flex items-center justify-center mb-5 group-hover:border-[#E8754A]/70 group-hover:neon-gold transition-all duration-300 relative">
                  <f.icon className="w-5 h-5 text-[#E8754A] drop-shadow-[0_0_8px_rgba(232,117,74,0.6)]" />
                </div>
                <h3 className="font-black text-sm uppercase tracking-wide mb-2 text-white relative" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{f.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed relative">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="gold-line" />

      {/* Pricing */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16">
            <div className="text-[10px] text-[#E8754A]/70 font-black tracking-[0.2em] uppercase mb-3 neon-text-gold">Access Tiers</div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Choose Your<br /><span className="holo-text">Position.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {tiers.map(t => (
              <div key={t.name} className={`p-6 flex flex-col relative lift-3d ${t.highlighted ? "glass-strong holo-border neon-gold" : "glass"}`}>
                {t.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-[#E8754A] to-[#ffb48c] text-black text-[9px] font-black uppercase tracking-[0.15em] neon-gold">
                    Most Popular
                  </div>
                )}
                <div className="mb-6 relative">
                  <div className="text-[10px] font-black text-[#E8754A]/70 uppercase tracking-[0.2em] mb-3">{t.name}</div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl font-black ${t.highlighted ? "holo-text" : "text-white"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.price}</span>
                    {t.period && <span className="text-white/35 text-sm font-medium">{t.period}</span>}
                  </div>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6 relative">
                  {t.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <Check className="w-3 h-3 text-[#E8754A] shrink-0 drop-shadow-[0_0_4px_rgba(232,117,74,0.6)]" />
                      <span className="text-white/70 font-medium">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up" className="relative">
                  <Button
                    className={`w-full font-black uppercase tracking-wide text-[11px] h-10 ${
                      t.highlighted
                        ? "bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] text-black border-[#E8754A] neon-gold hover:neon-gold-strong"
                        : "bg-transparent text-[#E8754A]/75 border border-[#E8754A]/30 hover:border-[#E8754A]/55 hover:text-[#E8754A] hover:bg-[#E8754A]/5"
                    }`}
                    style={t.highlighted ? { backgroundSize: "200% 100%" } : undefined}
                  >
                    {t.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center relative z-10 glass-strong p-12 holo-border scan-pulse">
          <h2 className="text-5xl md:text-6xl font-black tracking-tight uppercase mb-4 relative" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            The Network<br /><span className="holo-text neon-text-gold">Awaits You.</span>
          </h2>
          <p className="text-white/55 text-lg mb-10 font-medium relative">
            Thousands of operators are already inside. Your seat is waiting.
          </p>
          <Link href="/sign-up" className="relative inline-block">
            <Button size="lg" className="group relative font-black text-base px-12 h-13 bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] text-black border-[#E8754A] uppercase tracking-tight neon-gold-strong overflow-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif", backgroundSize: "200% 100%", animation: "holo-shift 4s ease infinite" }}>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <span className="relative">Claim Your Identity</span> <ArrowRight className="ml-2 w-4 h-4 relative" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-[#E8754A]/15 px-6 relative z-10 glass-subtle">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-4 text-sm text-white/25">
          <div className="flex items-center gap-2">
            <img src={`${basePath}/orbn-logo.png`} alt="ORBN" className="w-5 h-5 object-contain" />
            <span className="font-black text-[#E8754A]/50" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>ORBN</span>
          </div>
          <div className="flex-1" />
          <span>© 2026 ORBN. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
