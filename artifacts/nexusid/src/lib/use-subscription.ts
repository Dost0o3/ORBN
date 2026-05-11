import { useQuery } from "@tanstack/react-query";

export type SubscriptionTier = "free" | "operator" | "enterprise";

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasActiveSubscription: boolean;
  billingEnabled: boolean;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchSubscription(): Promise<SubscriptionStatus> {
  const res = await fetch(`${basePath}/api/billing/me`, { credentials: "include" });
  if (!res.ok) {
    return {
      tier: "free",
      status: "inactive",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      hasActiveSubscription: false,
      billingEnabled: false,
    };
  }
  return res.json();
}

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription", "me"],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  });
}

export function isPro(sub: SubscriptionStatus | undefined): boolean {
  if (!sub) return false;
  return sub.tier === "operator" || sub.tier === "enterprise";
}
