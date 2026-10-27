import { useEffect } from "react";
import { siteConfig } from "@/config/site";
import { recordSeo, type SeoMeta } from "@/lib/seo-store";

type PageMeta = SeoMeta;

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
export function usePageMeta({ title, description, path, noindex, type = "website", image, jsonLd }: PageMeta) {
  // During prerendering (no document) record the head data so the build script can write it into the HTML.
  if (typeof document === "undefined") recordSeo({ title, description, path, noindex, type, image, jsonLd });

  useEffect(() => {
    const url = path !== undefined ? `${siteConfig.url}${path}` : undefined;
    document.title = title;
    setMeta('meta[name="description"]', meta("name", "description"), "content", description);
    setMeta('meta[property="og:title"]', meta("property", "og:title"), "content", title);
    setMeta('meta[property="og:description"]', meta("property", "og:description"), "content", description);
    setMeta('meta[property="og:type"]', meta("property", "og:type"), "content", type);
    const imageUrl = image ? (image.startsWith("http") ? image : `${siteConfig.url}${image}`) : undefined;
    setMeta('meta[property="og:image"]', meta("property", "og:image"), "content", imageUrl);
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

    // Replace any JSON-LD from the prerendered HTML so it isn't duplicated after hydration.
    document.head.querySelectorAll("script[data-seo-jsonld]").forEach((el) => el.remove());
    const scripts = (jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []).map((data) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seoJsonld = "";
      script.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
      document.head.appendChild(script);
      return script;
    });
    return () => {
      scripts.forEach((s) => s.remove());
    };
  }, [title, description, path, noindex, type, image, jsonLd]);
}
