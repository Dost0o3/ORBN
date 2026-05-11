import React from "react";
import { Button } from "@/components/ui/button";
import { Brain, Zap, Lock, Flame, Network, Crown, ArrowRight, Check, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

import "./_linear.css";

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

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export function LinearRefined() {
  return (
    <div className="linear-theme min-h-screen selection:bg-linear-accent selection:text-white overflow-hidden relative">
      {/* Background Mesh */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-linear-accent/5 to-transparent blur-[100px] opacity-50" />
        <div className="absolute top-1/4 right-[-20%] w-[800px] h-[800px] rounded-full bg-linear-accent/5 blur-[120px] opacity-40" />
        <div className="absolute bottom-0 left-[-10%] w-[600px] h-[600px] rounded-full bg-linear-accent/5 blur-[100px] opacity-30" />
        <img 
          src="/__mockup/images/linear-mesh-bg.png" 
          className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
          alt=""
        />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-linear-border/50 bg-linear-bg/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-linear-panel border border-linear-border">
              <div className="w-2.5 h-2.5 bg-linear-text-main rounded-sm" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-linear-text-main">
              NexusID
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/sign-in" className="text-sm font-medium text-linear-text-muted hover:text-linear-text-main transition-colors">
              Sign In
            </a>
            <a href="/sign-up" className="linear-button text-xs font-semibold px-4 py-1.5 rounded-full">
              Enter
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-24">
        {/* Hero */}
        <section className="px-6 mb-32">
          <motion.div 
            className="max-w-4xl mx-auto text-center"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-linear-border/60 bg-linear-panel/50 backdrop-blur-sm text-xs font-medium text-linear-text-muted mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-linear-accent animate-pulse" />
              NexusID is now in early access
              <ChevronRight className="w-3 h-3 ml-1" />
            </motion.div>
            
            <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-semibold tracking-tighter text-linear-text-main leading-[1.1] mb-6">
              The network.<br />
              <span className="text-linear-text-muted">The power.</span><br />
              The move.
            </motion.h1>
            
            <motion.p variants={fadeUp} className="text-lg md:text-xl text-linear-text-muted max-w-2xl mx-auto mb-10 font-normal leading-relaxed">
              NexusID is the professional network for people who play to win. AI-powered. Reputation-driven. No noise — just signal.
            </motion.p>
            
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-4">
              <a href="/sign-up" className="linear-button text-sm font-medium px-6 py-2.5 rounded-full flex items-center gap-2">
                Enter NexusID <ArrowRight className="w-4 h-4" />
              </a>
              <a href="/sign-in" className="linear-button-outline text-sm font-medium px-6 py-2.5 rounded-full">
                Sign In
              </a>
            </motion.div>
          </motion.div>
        </section>

        {/* Stats */}
        <section className="px-6 mb-32">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((s, i) => (
                <div key={i} className="linear-glass rounded-2xl p-6 text-center border border-linear-border">
                  <div className="text-3xl font-semibold text-linear-text-main mb-1 tracking-tight">{s.value}</div>
                  <div className="linear-mono text-[11px] uppercase tracking-wider text-linear-text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 mb-32">
          <div className="max-w-5xl mx-auto">
            <div className="mb-16 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-linear-text-main mb-4">
                Weapons of the trade.
              </h2>
              <p className="text-lg text-linear-text-muted">
                Built different. By design.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <div key={i} className="linear-glass rounded-2xl p-8 border border-linear-border hover:border-linear-border/80 transition-colors group">
                  <div className="w-10 h-10 rounded-xl bg-linear-panel border border-linear-border flex items-center justify-center mb-6 group-hover:border-linear-accent/50 group-hover:text-linear-accent text-linear-text-main transition-colors">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-medium text-linear-text-main mb-3">{f.title}</h3>
                  <p className="text-sm text-linear-text-muted leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-6 mb-32">
          <div className="max-w-5xl mx-auto">
            <div className="mb-16 text-center">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-linear-text-main mb-4">
                Choose your position.
              </h2>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {tiers.map((t, i) => (
                <div key={i} className={`rounded-2xl p-8 flex flex-col ${t.highlighted ? 'bg-linear-panel border border-linear-accent/30 shadow-[0_0_30px_rgba(123,97,255,0.05)]' : 'linear-glass border border-linear-border'}`}>
                  <div className="mb-8">
                    <div className="linear-mono text-[11px] uppercase tracking-wider text-linear-accent mb-4">{t.name}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-semibold text-linear-text-main tracking-tight">{t.price}</span>
                      {t.period && <span className="text-sm text-linear-text-muted">{t.period}</span>}
                    </div>
                  </div>
                  
                  <ul className="space-y-4 flex-1 mb-8">
                    {t.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm">
                        <Check className="w-4 h-4 text-linear-accent shrink-0 mt-0.5" />
                        <span className="text-linear-text-muted">{f}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <a href="/sign-up" className={`text-sm font-medium px-4 py-2.5 rounded-full text-center transition-all ${
                    t.highlighted 
                      ? 'bg-linear-text-main text-linear-bg hover:bg-white hover:scale-[1.02]' 
                      : 'bg-linear-panel text-linear-text-main border border-linear-border hover:bg-linear-border'
                  }`}>
                    {t.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6">
          <div className="max-w-3xl mx-auto text-center linear-glass rounded-3xl p-16 border border-linear-border">
            <h2 className="text-4xl font-semibold tracking-tight text-linear-text-main mb-4">
              The network awaits you.
            </h2>
            <p className="text-lg text-linear-text-muted mb-8">
              Thousands of operators are already inside. Your seat is waiting.
            </p>
            <a href="/sign-up" className="linear-button text-sm font-medium px-8 py-3 rounded-full inline-flex items-center gap-2">
              Claim Your Identity <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-linear-border bg-linear-bg/80 backdrop-blur-md relative z-10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-linear-text-muted">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-linear-panel border border-linear-border flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-linear-text-muted rounded-[1px]" />
            </div>
            <span className="font-medium">NexusID</span>
          </div>
          <div>
            © 2026 NexusID. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
