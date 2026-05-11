import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import wallpaperUrl from "./wallpaper.jpg";

// Inject wallpaper URL into CSS var so body background image resolves correctly
// regardless of the artifact's BASE_URL prefix.
document.documentElement.style.setProperty(
  "--wallpaper-url",
  `url(${wallpaperUrl})`,
);

// ─── PostHog analytics (env-gated) ───────────────────────────────────────────
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (POSTHOG_KEY) {
  import("posthog-js").then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: "https://app.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      persistence: "localStorage",
    });
  });
}

// ─── Google Analytics 4 (env-gated) ─────────────────────────────────────────
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
if (GA_ID) {
  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.async = true;
  document.head.appendChild(script);

  script.onload = () => {
    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(...args: unknown[]) {
      (window as any).dataLayer.push(args);
    }
    gtag("js", new Date());
    gtag("config", GA_ID, { send_page_view: true });
    (window as any).gtag = gtag;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
