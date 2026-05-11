import { useEffect } from "react";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/lib/use-page-meta";
import { trackEvent } from "@/lib/analytics";

export default function BillingSuccessPage() {
  usePageMeta({ title: "Welcome, Operator", noIndex: true });
  const qc = useQueryClient();

  useEffect(() => {
    trackEvent("subscribe_completed", { tier: "operator" });
    qc.invalidateQueries({ queryKey: ["subscription"] });
  }, [qc]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-3">Welcome, Operator</h1>
        <p className="text-muted-foreground mb-8">
          Your subscription is active. Unlimited swipes, unlimited Soul Twin queries, premium Career Oracle runs, and the Verified Operator badge are now live on your account.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/feed">Go to Feed</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/profile/me">View profile</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
