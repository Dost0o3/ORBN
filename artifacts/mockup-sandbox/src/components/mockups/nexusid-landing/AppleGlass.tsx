import React, { useEffect, useRef } from "react";
import { Brain, Zap, Lock, Flame, Network, Crown, ArrowRight, Check } from "lucide-react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
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

export function AppleGlass() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  
  const ySpring = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  const heroY = useTransform(ySpring, [0, 1], [0, 200]);
  const heroOpacity = useTransform(ySpring, [0, 0.2], [1, 0]);

  return (
    <div className="apple-glass min-h-screen relative" ref={containerRef}>
      {/* Abstract Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="blob-bg blob-1"></div>
        <div className="blob-bg blob-2"></div>
        <div className="blob-bg blob-3"></div>
      </div>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto glass-panel h-14 flex items-center justify-between px-6 rounded-full">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-black"></div>
            </div>
            <span className="font-display font-bold text-lg tracking-tight">NexusID</span>
          </div>
          
          <div className="flex items-center gap-3">
            <a href="/sign-in" className="text-sm font-medium text-white/70 hover:text-white px-4 py-2 transition-colors">
              Sign In
            </a>
            <a href="/sign-up" className="glass-button-primary text-sm px-5 py-2">
              Enter
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-24">
        {/* Hero Section */}
        <motion.section 
          className="min-h-[80vh] flex flex-col items-center justify-center px-6 text-center"
          style={{ y: heroY, opacity: heroOpacity }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="max-w-5xl mx-auto"
          >
            <h1 className="font-display text-6xl md:text-8xl font-bold tracking-tight leading-[1.05] mb-8 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50">
              The Network. <br />
              <span className="iridescent-text">The Power.</span> <br />
              The Move.
            </h1>
            <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto mb-12 font-medium tracking-tight">
              NexusID is the professional network for people who play to win. AI-powered. Reputation-driven. No noise — just signal.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/sign-up" className="glass-button-primary text-lg px-8 py-4 flex items-center gap-2 w-full sm:w-auto justify-center">
                Enter NexusID <ArrowRight className="w-5 h-5" />
              </a>
              <a href="/sign-in" className="glass-button text-lg px-8 py-4 w-full sm:w-auto justify-center flex">
                Sign In
              </a>
            </div>
          </motion.div>
        </motion.section>

        {/* Stats Section */}
        <section className="py-12 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="glass-panel grid grid-cols-2 md:grid-cols-4 divide-x divide-white/10 divide-y md:divide-y-0 p-8 rounded-[40px]">
              {stats.map((stat, i) => (
                <motion.div 
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="flex flex-col items-center justify-center p-6"
                >
                  <div className="font-display text-4xl md:text-5xl font-bold mb-2 iridescent-text">{stat.value}</div>
                  <div className="text-sm font-medium text-white/50 uppercase tracking-widest">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Built Different.<br />By Design.
              </h2>
              <p className="text-xl text-white/50 max-w-2xl mx-auto">
                Tools crafted for the elite operator.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <motion.div 
                  key={f.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="glass-panel p-8 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[50px] rounded-full group-hover:bg-white/10 transition-colors duration-500"></div>
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 border border-white/10 group-hover:scale-110 transition-transform duration-300">
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-3">{f.title}</h3>
                  <p className="text-white/50 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Choose Your Position.
              </h2>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 items-center">
              {tiers.map((t, i) => (
                <motion.div 
                  key={t.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className={`${t.highlighted ? 'glass-panel-strong scale-105 z-10' : 'glass-panel'} p-10 flex flex-col h-full relative`}
                >
                  {t.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}
                  <div className="mb-8">
                    <h3 className="text-lg font-medium text-white/60 mb-2">{t.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-5xl font-bold">{t.price}</span>
                      {t.period && <span className="text-white/40">{t.period}</span>}
                    </div>
                  </div>
                  
                  <ul className="space-y-4 mb-10 flex-1">
                    {t.features.map(f => (
                      <li key={f} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-white/80 shrink-0 mt-0.5" />
                        <span className="text-white/80">{f}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <a href="/sign-up" className={`w-full text-center py-4 rounded-full font-semibold transition-all ${t.highlighted ? 'bg-white text-black hover:scale-105' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                    {t.cta}
                  </a>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="glass-panel-strong p-16 text-center rounded-[48px] relative overflow-hidden">
              <div className="absolute inset-0 iridescent-bg opacity-20"></div>
              <div className="relative z-10">
                <h2 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6">
                  The Network Awaits You.
                </h2>
                <p className="text-xl text-white/70 mb-10 max-w-2xl mx-auto">
                  Thousands of operators are already inside. Your seat is waiting.
                </p>
                <a href="/sign-up" className="glass-button-primary text-lg px-10 py-5 inline-flex items-center gap-2">
                  Claim Your Identity <ArrowRight className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-10 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-black"></div>
            </div>
            <span className="font-display font-bold tracking-tight">NexusID</span>
          </div>
          <p className="text-sm text-white/40">
            © 2026 NexusID. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
