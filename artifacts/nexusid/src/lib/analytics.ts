import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

const CONSENT_KEY = "nexusid_analytics_consent";
const CONSENT_GRANTED = "granted";
const CONSENT_DENIED = "denied";

let posthogReady = false;
let gaReady = false;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function getAnalyticsConsent(): "granted" | "denied" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  const v = window.localStorage.getItem(CONSENT_KEY);
  if (v === CONSENT_GRANTED) return "granted";
  if (v === CONSENT_DENIED) return "denied";
  return "unknown";
}

export function setAnalyticsConsent(value: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, value === "granted" ? CONSENT_GRANTED : CONSENT_DENIED);
  if (value === "granted") initAnalytics();
  if (value === "denied") {
    if (posthogReady) {
      try { posthog.opt_out_capturing(); } catch {}
    }
  }
}

export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  // Privacy-by-default: do nothing until the user explicitly grants consent.
  if (getAnalyticsConsent() !== "granted") return;

  if (POSTHOG_KEY && !posthogReady) {
    try {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: "identified_only",
        capture_pageview: false,
        capture_pageleave: true,
        // Privacy-conservative defaults — opt-in features are off
        autocapture: false,
        disable_session_recording: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        respect_dnt: true,
      });
      posthogReady = true;
    } catch (err) {
      console.warn("[analytics] PostHog init failed", err);
    }
  }

  if (GA_ID && !gaReady) {
    try {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", GA_ID, {
        send_page_view: false,
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      gaReady = true;
    } catch (err) {
      console.warn("[analytics] GA4 init failed", err);
    }
  }
}

export function trackPageView(path: string, title?: string): void {
  if (typeof window === "undefined") return;
  if (posthogReady) {
    try { posthog.capture("$pageview", { $current_url: window.location.origin + path, page_title: title }); } catch {}
  }
  if (gaReady && GA_ID && window.gtag) {
    try {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: window.location.origin + path,
        page_title: title ?? document.title,
      });
    } catch {}
  }
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (posthogReady) {
    try { posthog.capture(name, props); } catch {}
  }
  if (gaReady && window.gtag) {
    try { window.gtag("event", name, props ?? {}); } catch {}
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // Do not pass PII to analytics. Only the opaque user id is forwarded.
  if (posthogReady) {
    try { posthog.identify(userId, traits ? sanitizeTraits(traits) : undefined); } catch {}
  }
  if (gaReady && GA_ID && window.gtag) {
    try { window.gtag("config", GA_ID, { user_id: userId }); } catch {}
  }
}

function sanitizeTraits(traits: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["email", "name", "fullName", "username", "phone", "phoneNumber"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(traits)) {
    if (!blocked.has(k)) out[k] = v;
  }
  return out;
}

export function resetAnalyticsUser(): void {
  if (typeof window === "undefined") return;
  if (posthogReady) {
    try { posthog.reset(); } catch {}
  }
}

export const isAnalyticsEnabled = (): boolean => Boolean(POSTHOG_KEY) || Boolean(GA_ID);
