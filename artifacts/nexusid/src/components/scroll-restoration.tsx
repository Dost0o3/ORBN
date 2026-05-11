import { useEffect } from "react";
import { useLocation } from "wouter";

export function ScrollRestoration() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);

  return null;
}

export default ScrollRestoration;
