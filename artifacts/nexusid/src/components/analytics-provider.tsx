import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import {
  initAnalytics,
  trackPageView,
  identifyUser,
  resetAnalyticsUser,
  getAnalyticsConsent,
  setAnalyticsConsent,
  isAnalyticsEnabled,
} from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, isSignedIn, isLoaded } = useUser();
  const [consent, setConsentState] = useState<"granted" | "denied" | "unknown">("unknown");

  useEffect(() => {
    setConsentState(getAnalyticsConsent());
    initAnalytics();
  }, []);

  useEffect(() => {
    if (consent === "granted") trackPageView(location);
  }, [location, consent]);

  useEffect(() => {
    if (!isLoaded) return;
    if (consent !== "granted") return;
    if (isSignedIn && user) {
      // No PII forwarded — only the opaque user id.
      identifyUser(user.id);
    } else {
      resetAnalyticsUser();
    }
  }, [isLoaded, isSignedIn, user, consent]);

  const choose = (value: "granted" | "denied") => {
    setAnalyticsConsent(value);
    setConsentState(value);
  };

  return (
    <>
      {children}
      {consent === "unknown" && isAnalyticsEnabled() ? (
        <div
          role="dialog"
          aria-label="Cookie and analytics preferences"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-2xl w-[calc(100%-2rem)] bg-[#0f0f0f] border border-[#E8754A]/25 p-4 shadow-2xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-[12px] text-white/70 flex-1">
              We use privacy-respecting analytics (no session recording, no PII forwarded) to
              understand how the network is used. You can change this anytime.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => choose("denied")}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white border border-white/15"
              >
                Decline
              </button>
              <button
                onClick={() => choose("granted")}
                className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-black bg-[#E8754A] hover:bg-[#d8b860]"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
