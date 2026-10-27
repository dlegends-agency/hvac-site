/** Collects per-route head data during server-side prerendering (see scripts/prerender.mjs). */
export interface SeoMeta {
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  type?: "website" | "article";
  image?: string;
  jsonLd?: object | object[];
}

let recorded: SeoMeta | null = null;

/** Called by usePageMeta while rendering on the server. */
export function recordSeo(meta: SeoMeta) {
  recorded = meta;
}

/** Returns and clears the head data recorded for the page that was just rendered. */
export function takeSeo(): SeoMeta | null {
  const meta = recorded;
  recorded = null;
  return meta;
}
