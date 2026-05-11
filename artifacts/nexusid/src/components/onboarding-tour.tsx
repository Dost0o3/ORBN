import { useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "nexusid-onboarding-completed-v1";

export function OnboardingTour() {
  const [location] = useLocation();
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (location !== "/feed") return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch {
      return;
    }

    const t = window.setTimeout(() => {
      const drv = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        smoothScroll: true,
        overlayColor: "rgba(0,0,0,0.75)",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Got it",
        steps: [
          {
            element: 'a[href$="/feed"]',
            popover: {
              title: "Welcome to ORBN",
              description:
                "This is your Feed — signal-only updates from your network. We'll show you the four moves that make this place different.",
            },
          },
          {
            element: 'a[href$="/connect"]',
            popover: {
              title: "Connect — swipe-to-match networking",
              description:
                "Tinder-style matching for high-signal professionals. Swipe right on people you want in your circle.",
            },
          },
          {
            element: 'a[href$="/ai/soul-twin"]',
            popover: {
              title: "Soul Twin — your AI co-pilot",
              description:
                "An AI trained on your network and goals. Ask it who to talk to, what to post, what move to make next.",
            },
          },
          {
            element: 'a[href$="/bounties"]',
            popover: {
              title: "Bounty Board — paid intros & gigs",
              description:
                "Earn by referring talent, solving problems, or completing micro-gigs posted by other operators.",
            },
          },
        ],
        onDestroyed: () => {
          try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
          trackEvent("onboarding_completed");
        },
      });

      trackEvent("onboarding_started");
      drv.drive();
    }, 800);

    return () => window.clearTimeout(t);
  }, [location, isSignedIn, isLoaded]);

  return null;
}
