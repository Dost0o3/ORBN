import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/lib/use-page-meta";

const sections = [
  {
    title: "Power Score",
    body:
      "Your reputation, scored 0–1000. Built from network reach, content signal, activity depth, and reputation events (bounties won, circles vouched into). Updates in near-real-time. Used to rank you in Explore, gate Inner Circles, and unlock Bounty Board tiers.",
  },
  {
    title: "Connect — swipe matching",
    body:
      "Tinder for high-signal professionals. Profiles surfaced are scored against your goals (set in Profile → Goals) using your Soul Twin embedding. Right-swipe to express interest; mutual matches unlock chat. Recruits get 50 swipes/day. Operators get unlimited.",
  },
  {
    title: "Inner Circles",
    body:
      "Private invite-only groups. Members must vouch for you to join. Recruits can be a member of one Circle; Operators can join unlimited and create their own. Circles have private feeds, polls, and bounty pools.",
  },
  {
    title: "Soul Twin AI",
    body:
      "An AI co-pilot trained on your activity, network, and stated goals. Ask it: who should I talk to this week, what should I post, what's the next move on this opportunity. Recruits: 5 queries/day. Operators: unlimited.",
  },
  {
    title: "Career Oracle",
    body:
      "Strategic career analysis. Standard run scans your profile + network and suggests next moves. Premium run (Operator only) runs a deeper analysis with comparable-operator benchmarking, salary intelligence, and a 12-month strategic plan.",
  },
  {
    title: "Bounty Board",
    body:
      "Paid micro-gigs, intros, and referrals. Anyone can post a bounty (escrowed). Anyone can claim. Submissions are reviewed by the poster; winner gets paid out. Operators get priority placement on bounties they post.",
  },
  {
    title: "Ghost Mode (Operators only)",
    body:
      "Browse profiles without leaving a footprint. Toggle in your profile settings. Your visits to other profiles won't appear in their notifications.",
  },
  {
    title: "Billing & subscriptions",
    body:
      "Managed via Stripe. Upgrade from /pricing. Manage or cancel anytime via the customer portal (Profile → Manage subscription). Cancellations take effect at the end of the current billing period.",
  },
];

export default function DocsPage() {
  usePageMeta({
    title: "Docs — How ORBN works",
    description:
      "Reference for Power Score, Connect, Inner Circles, Soul Twin, Career Oracle, Bounty Board, and billing.",
    canonical: "https://nexusid.app/docs",
  });
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="text-4xl font-bold tracking-tight mb-3">Docs</h1>
        <p className="text-muted-foreground mb-12">
          A short reference for how the moves work. If something here is unclear, ask Soul Twin — it's been briefed on this doc.
        </p>

        <div className="space-y-10">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-xl font-bold mb-2">{s.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border text-sm text-muted-foreground">
          <p>
            See pricing on the <Link href="/pricing" className="underline hover:text-foreground">pricing page</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
