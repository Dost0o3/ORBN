import { Link } from "wouter";
import { Check, Zap, Crown, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/lib/use-subscription";
import { ContactSalesDialog } from "@/components/contact-sales-dialog";
import { usePageMeta } from "@/lib/use-page-meta";
import { trackEvent } from "@/lib/analytics";
import { useState } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const tiers = [
  {
    id: "free",
    name: "Recruit",
    price: "$0",
    period: "forever",
    icon: Zap,
    description: "Start playing. See if the network is for you.",
    features: [
      "Power Score reputation",
      "Public Feed & Explore",
      "Up to 50 Connect swipes/day",
      "1 Inner Circle membership",
      "Soul Twin AI — 5 queries/day",
      "Standard Bounty Board access",
    ],
    cta: "Current plan",
  },
  {
    id: "operator",
    name: "Operator",
    price: "$19",
    period: "per month",
    icon: Crown,
    description: "For operators who play to win.",
    features: [
      "Everything in Recruit",
      "Unlimited Connect swipes",
      "Unlimited Inner Circles",
      "Soul Twin AI — unlimited queries",
      "Career Oracle — premium runs (deep analysis)",
      "Priority Bounty Board placement",
      "Ghost Mode (browse anonymously)",
      "Profile boost — 3x Explore visibility",
      "Verified Operator badge",
    ],
    cta: "Become an Operator",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "talk to us",
    icon: Building2,
    description: "For teams, talent ops, and recruiters at scale.",
    features: [
      "Everything in Operator",
      "Team seats with admin controls",
      "Bulk talent search & exports",
      "Private Inner Circles for your org",
      "Custom AI fine-tuning on your network",
      "Dedicated success manager",
      "SSO / SAML / SCIM",
      "Custom SLA & data residency",
    ],
    cta: "Contact Sales",
  },
] as const;

export default function PricingPage() {
  usePageMeta({
    title: "Pricing — Recruit, Operator, Enterprise",
    description:
      "Free forever for Recruits. $19/mo for Operators. Custom pricing for Enterprise teams. No noise — just signal.",
    canonical: "https://nexusid.app/pricing",
  });
  const { isSignedIn } = useUser();
  const { data: sub } = useSubscription();
  const { toast } = useToast();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const currentTier = sub?.tier ?? "free";

  async function startCheckout() {
    if (!isSignedIn) {
      window.location.href = `${basePath}/sign-up?redirect_url=${encodeURIComponent("/pricing")}`;
      return;
    }
    setLoadingTier("operator");
    trackEvent("subscribe_click", { tier: "operator" });
    try {
      const res = await fetch(`${basePath}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tier: "operator" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
      setLoadingTier(null);
    }
  }

  async function openPortal() {
    setLoadingTier("portal");
    try {
      const res = await fetch(`${basePath}/api/billing/portal`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Portal failed");
      window.location.href = data.url;
    } catch (err) {
      toast({
        title: "Couldn't open billing portal",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
      setLoadingTier(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Pricing for operators
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade when you're ready to win bigger. Cancel anytime — no contracts, no nonsense.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            const isCurrent = currentTier === tier.id;
            const isHighlight = tier.id === "operator";
            return (
              <div
                key={tier.id}
                className={`relative rounded-lg border p-6 flex flex-col ${
                  isHighlight
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                    : "border-border bg-card"
                }`}
                data-testid={`tier-${tier.id}`}
              >
                {isHighlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
                    Most popular
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-5 h-5" />
                  <h3 className="text-lg font-bold">{tier.name}</h3>
                </div>
                <div className="mb-1">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground ml-2">{tier.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>

                <ul className="space-y-2.5 mb-8 flex-grow">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {tier.id === "free" && (
                  <Button variant="outline" disabled className="w-full" data-testid="cta-free">
                    {isCurrent ? "Current plan" : "Free forever"}
                  </Button>
                )}

                {tier.id === "operator" && (
                  isCurrent ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={openPortal}
                      disabled={loadingTier === "portal"}
                      data-testid="cta-manage"
                    >
                      {loadingTier === "portal" ? "Opening..." : "Manage subscription"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={startCheckout}
                      disabled={loadingTier === "operator"}
                      data-testid="cta-operator"
                    >
                      {loadingTier === "operator" ? "Redirecting..." : tier.cta}
                    </Button>
                  )
                )}

                {tier.id === "enterprise" && (
                  <ContactSalesDialog
                    trigger={
                      <Button variant="outline" className="w-full" data-testid="cta-enterprise">
                        {tier.cta}
                      </Button>
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-16 text-center text-sm text-muted-foreground">
          <p>Questions? Read the <Link href="/docs" className="underline hover:text-foreground">docs</Link> or contact sales.</p>
          <p className="mt-2">All prices in USD. Taxes calculated at checkout. Cancel anytime.</p>
        </div>
      </div>
    </div>
  );
}
