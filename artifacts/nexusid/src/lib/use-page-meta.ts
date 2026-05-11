import { useEffect } from "react";

interface PageMeta {
  title: string;
  description?: string;
  ogImage?: string;
  noIndex?: boolean;
  canonical?: string;
}

const SITE_NAME = "ORBN";
const DEFAULT_DESCRIPTION =
  "AI-powered professional network for operators who play to win. Power Score, Inner Circles, Soul Twin AI, Bounty Board.";

function setMetaTag(selector: string, attrName: string, attrValue: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    const fullTitle = meta.title.includes(SITE_NAME) ? meta.title : `${meta.title} — ${SITE_NAME}`;
    const description = meta.description ?? DEFAULT_DESCRIPTION;
    const previousTitle = document.title;
    document.title = fullTitle;

    setMetaTag('meta[name="description"]', "name", "description", description);
    setMetaTag('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMetaTag('meta[property="og:description"]', "property", "og:description", description);
    setMetaTag('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMetaTag('meta[name="twitter:description"]', "name", "twitter:description", description);

    if (meta.ogImage) {
      setMetaTag('meta[property="og:image"]', "property", "og:image", meta.ogImage);
      setMetaTag('meta[name="twitter:image"]', "name", "twitter:image", meta.ogImage);
    }

    setMetaTag(
      'meta[name="robots"]',
      "name",
      "robots",
      meta.noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    );

    if (meta.canonical) {
      setLink("canonical", meta.canonical);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [meta.title, meta.description, meta.ogImage, meta.noIndex, meta.canonical]);
}
