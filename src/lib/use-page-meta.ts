import { useEffect } from "react";
import { siteConfig } from "@/config/site";

interface PageMeta {
  title: string;
  description?: string;
  /** Path such as "/blog/my-post"; combined with the configured site URL. */
  path?: string;
  noindex?: boolean;
  type?: "website" | "article";
  jsonLd?: object;
}

function setMeta(selector: string, create: () => HTMLElement, attr: "content" | "href", value: string | undefined) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (value === undefined) {
    el?.remove();
    return;
  }
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const meta = (attrName: "name" | "property", key: string) => () => {
  const el = document.createElement("meta");
  el.setAttribute(attrName, key);
  return el;
};

/** Client-side head management: title, description, canonical, Open Graph, robots and JSON-LD. */
export function usePageMeta({ title, description, path, noindex, type = "website", jsonLd }: PageMeta) {
  useEffect(() => {
    const url = path !== undefined ? `${siteConfig.url}${path}` : undefined;
    document.title = title;
    setMeta('meta[name="description"]', meta("name", "description"), "content", description);
    setMeta('meta[property="og:title"]', meta("property", "og:title"), "content", title);
    setMeta('meta[property="og:description"]', meta("property", "og:description"), "content", description);
    setMeta('meta[property="og:type"]', meta("property", "og:type"), "content", type);
    setMeta('meta[property="og:url"]', meta("property", "og:url"), "content", url);
    setMeta('meta[name="robots"]', meta("name", "robots"), "content", noindex ? "noindex, nofollow" : undefined);
    setMeta(
      'link[rel="canonical"]',
      () => {
        const el = document.createElement("link");
        el.rel = "canonical";
        return el;
      },
      "href",
      url,
    );

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
      document.head.appendChild(script);
    }
    return () => {
      script?.remove();
    };
  }, [title, description, path, noindex, type, jsonLd]);
}
