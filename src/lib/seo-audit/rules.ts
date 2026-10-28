export type Severity = "error" | "warning" | "info";
export type PageKind = "static" | "post" | "listing";

export interface Issue {
  /** Stable rule id, used to group issues. */
  rule: string;
  severity: Severity;
  message: string;
  /** Page path the issue applies to; omitted for site-wide issues. */
  url?: string;
  detail?: string;
}

export interface PageResult {
  url: string;
  kind: PageKind;
  title: string;
  titleLen: number;
  description: string;
  descLen: number;
  canonical: string;
  h1Count: number;
  h1: string;
  words: number;
  images: number;
  imagesNoAlt: number;
  schemaTypes: string[];
  internalLinks: string[];
  externalLinks: number;
  /** Server HTML checks (null when not applicable or not meaningful, e.g. on the dev server). */
  rawChecked: boolean;
  issues: Issue[];
}

export interface AuditContext {
  siteUrl: string;
  /** Normalised paths that exist on the site (static routes plus published posts and listings). */
  knownPaths: Set<string>;
  isDev: boolean;
  homeTitle: string;
}

export const normalizePath = (p: string) => {
  const path = p.split("#")[0].split("?")[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path || "/";
};

/** Index, form and listing pages are expected to have little prose. */
const THIN_OK = new Set(["/", "/blog", "/directory", "/directory/add", "/services", "/contact"]);
const MIN_WORDS = 250;
const GENERIC_ANCHORS = new Set(["click here", "here", "read more", "more", "link"]);

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function meta(doc: Document, selector: string) {
  return doc.head.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";
}

/** Analyses one rendered page. */
export function analyzePage(doc: Document, path: string, kind: PageKind, ctx: AuditContext): PageResult {
  const issues: Issue[] = [];
  const add = (rule: string, severity: Severity, message: string, detail?: string) => issues.push({ rule, severity, message, url: path, detail });

  // --- Title ---------------------------------------------------------------
  const title = doc.title.trim();
  if (!title) add("title-missing", "error", "Missing <title>.");
  else if (title.length < 30) add("title-short", "warning", `Title is short (${title.length} characters).`, title);
  else if (title.length > 65) add("title-long", "warning", `Title may be truncated in results (${title.length} characters; aim for about 30 to 60).`, title);

  // --- Meta description ------------------------------------------------------
  const description = meta(doc, 'meta[name="description"]');
  if (!description) add("description-missing", "error", "Missing meta description.");
  else if (description.length < 70) add("description-short", "warning", `Meta description is short (${description.length} characters).`, description);
  else if (description.length > 160) add("description-long", "warning", `Meta description may be truncated (${description.length} characters; aim for about 70 to 160).`, description);

  // --- Indexing directives & canonical ------------------------------------
  const robots = meta(doc, 'meta[name="robots"]').toLowerCase();
  if (robots.includes("noindex")) add("noindex", "error", "Page is set to noindex, so search engines won't list it.", robots);
  const canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? "";
  const expected = `${ctx.siteUrl}${path === "/" ? "" : path}`;
  if (!canonical) add("canonical-missing", "error", "Missing canonical link.");
  else {
    const strip = (u: string) => u.replace(/\/+$/, "");
    if (strip(canonical) !== strip(expected)) add("canonical-mismatch", "warning", "Canonical URL differs from the configured site URL plus this path.", `Found ${canonical}, expected ${expected}`);
    if (!ctx.isDev && new URL(canonical, location.href).host !== location.host) {
      add("canonical-host", "error", "Canonical points to a different host than the one being served. Check VITE_SITE_URL.", canonical);
    }
  }

  // --- Headings ------------------------------------------------------------
  const h1s = [...doc.querySelectorAll("h1")];
  if (h1s.length === 0) add("h1-missing", "error", "No H1 heading.");
  else if (h1s.length > 1) add("h1-multiple", "warning", `${h1s.length} H1 headings; use one per page.`);
  const levels = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      add("heading-skip", "info", `Heading level skipped (h${levels[i - 1]} to h${levels[i]}).`);
      break;
    }
  }

  // --- Content -------------------------------------------------------------
  const body = doc.querySelector("main") ?? doc.body;
  const words = countWords(body.innerText || body.textContent || "");
  if (words < MIN_WORDS && !THIN_OK.has(path)) add("thin-content", "warning", `Thin content (${words} words).`);

  // --- Images --------------------------------------------------------------
  const imgs = [...doc.querySelectorAll("img")];
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt"));
  if (noAlt.length) add("img-alt", "error", `${noAlt.length} image(s) without an alt attribute.`, noAlt.map((i) => i.getAttribute("src")).join(", "));

  // --- Structured data -----------------------------------------------------
  const schemaTypes: string[] = [];
  let ldInvalid = 0;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      const data = JSON.parse(s.textContent ?? "");
      for (const item of Array.isArray(data) ? data : [data]) schemaTypes.push(String(item["@type"] ?? "unknown"));
    } catch {
      ldInvalid++;
    }
  });
  if (ldInvalid) add("schema-invalid", "error", `${ldInvalid} JSON-LD block(s) contain invalid JSON.`);
  else if (schemaTypes.length === 0) add("schema-missing", "warning", "No structured data (JSON-LD).");

  // --- Open Graph ----------------------------------------------------------
  for (const prop of ["og:title", "og:description", "og:url"]) {
    if (!meta(doc, `meta[property="${prop}"]`)) add("og-missing", "warning", `Missing ${prop}.`);
  }
  if (!meta(doc, 'meta[property="og:image"]')) add("og-image", "info", "No og:image (social shares will have no preview image).");

  // --- Links ---------------------------------------------------------------
  const internal: string[] = [];
  let external = 0;
  let noText = 0;
  const generic = new Set<string>();
  const broken = new Set<string>();
  const badAnchors = new Set<string>();

  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const raw = a.getAttribute("href") ?? "";
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return;
    // Decorative duplicate links (hidden from assistive tech) are covered by an adjacent text link.
    const decorative = a.getAttribute("aria-hidden") === "true";
    const text = (a.textContent ?? "").trim() || a.getAttribute("aria-label") || a.querySelector("img[alt]")?.getAttribute("alt") || "";
    if (!text.trim() && !decorative) noText++;
    if (GENERIC_ANCHORS.has(text.trim().toLowerCase())) generic.add(text.trim());

    let url: URL;
    try {
      url = new URL(raw, `${location.origin}${path}`);
    } catch {
      return;
    }
    if (url.origin !== location.origin) {
      external++;
      if (a.target === "_blank" && !/noopener|noreferrer/.test(a.rel)) add("link-noopener", "warning", "External link opens in a new tab without rel=noopener.", raw);
      return;
    }
    const target = normalizePath(url.pathname);
    if (raw.startsWith("#") || (target === normalizePath(path) && url.hash)) {
      const id = url.hash.slice(1);
      if (id && !doc.getElementById(id)) badAnchors.add(url.hash);
      return;
    }
    if (target.startsWith("/admin")) return;
    internal.push(target);
    if (!ctx.knownPaths.has(target) && !/\.(svg|xml|txt|png|jpg|webp|ico)$/.test(target)) broken.add(raw);
  });

  if (noText) add("link-no-text", "warning", `${noText} link(s) without accessible text.`);
  if (generic.size) add("link-generic", "info", `Generic link text: ${[...generic].join(", ")}.`);
  if (broken.size) add("link-broken", "error", `${broken.size} internal link(s) point to pages that don't exist.`, [...broken].join(", "));
  if (badAnchors.size) add("anchor-missing", "error", `${badAnchors.size} in-page link(s) point to missing sections.`, [...badAnchors].join(", "));
  if (new Set(internal).size < 3 && path !== "/") add("few-links", "warning", `Only ${new Set(internal).size} distinct internal links from this page.`);

  return {
    url: path, kind, title, titleLen: title.length, description, descLen: description.length, canonical,
    h1Count: h1s.length, h1: h1s[0]?.textContent?.trim() ?? "", words, images: imgs.length, imagesNoAlt: noAlt.length,
    schemaTypes, internalLinks: [...new Set(internal)], externalLinks: external, rawChecked: false, issues,
  };
}

/** Checks the HTML the server returns, which is what crawlers see before running JavaScript. */
export function analyzeRawHtml(html: string, path: string, ctx: AuditContext): Issue[] {
  const issues: Issue[] = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const add = (rule: string, message: string, detail?: string) => issues.push({ rule, severity: "error", message, url: path, detail });
  const title = doc.title.trim();
  if (path !== "/" && title === ctx.homeTitle) {
    add("raw-generic-shell", "Server HTML is the generic homepage shell: this page isn't prerendered, so crawlers only see its content after running JavaScript.");
    return issues;
  }
  if (!doc.querySelector("h1")) add("raw-no-h1", "No H1 in the initial server HTML.");
  if (!doc.querySelector('link[rel="canonical"]')) add("raw-no-canonical", "No canonical link in the initial server HTML.");
  if (!doc.querySelector('meta[name="description"]')) add("raw-no-description", "No meta description in the initial server HTML.");
  if (!doc.querySelector('script[type="application/ld+json"]')) issues.push({ rule: "raw-no-schema", severity: "warning", message: "No JSON-LD in the initial server HTML.", url: path });
  return issues;
}

/** Issues that only show up when comparing pages with each other. */
export function crossPageIssues(pages: PageResult[]): Issue[] {
  const issues: Issue[] = [];
  const group = (key: (p: PageResult) => string, rule: string, label: string) => {
    const map = new Map<string, PageResult[]>();
    for (const p of pages) {
      const k = key(p).trim().toLowerCase();
      if (k) map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const list of map.values()) {
      if (list.length > 1) for (const p of list) issues.push({ rule, severity: "warning", url: p.url, message: `Duplicate ${label} shared with ${list.length - 1} other page(s).`, detail: p.title || p.description });
    }
  };
  group((p) => p.title, "duplicate-title", "title");
  group((p) => p.description, "duplicate-description", "meta description");

  const inbound = new Map<string, number>();
  for (const p of pages) for (const l of p.internalLinks) if (l !== p.url) inbound.set(l, (inbound.get(l) ?? 0) + 1);
  for (const p of pages) if (p.url !== "/" && !inbound.get(p.url)) issues.push({ rule: "orphan", severity: "warning", url: p.url, message: "No other audited page links to this page (orphan page)." });
  return issues;
}

export const RULE_LABELS: Record<string, string> = {
  "title-missing": "Missing title", "title-short": "Short title", "title-long": "Long title",
  "description-missing": "Missing meta description", "description-short": "Short meta description", "description-long": "Long meta description",
  noindex: "Page is noindex", "canonical-missing": "Missing canonical", "canonical-mismatch": "Canonical mismatch", "canonical-host": "Canonical host mismatch",
  "h1-missing": "Missing H1", "h1-multiple": "Multiple H1s", "heading-skip": "Heading levels skipped", "thin-content": "Thin content",
  "img-alt": "Images without alt text", "schema-invalid": "Invalid structured data", "schema-missing": "No structured data",
  "og-missing": "Missing Open Graph tags", "og-image": "No og:image", "link-noopener": "External links missing rel=noopener",
  "link-no-text": "Links without text", "link-generic": "Generic link text", "link-broken": "Broken internal links",
  "anchor-missing": "Broken in-page anchors", "few-links": "Few internal links", "duplicate-title": "Duplicate titles",
  "duplicate-description": "Duplicate meta descriptions", orphan: "Orphan pages", "raw-generic-shell": "Not prerendered (generic shell)",
  "raw-no-h1": "No H1 in server HTML", "raw-no-canonical": "No canonical in server HTML", "raw-no-description": "No description in server HTML",
  "raw-no-schema": "No schema in server HTML",
  "site-url": "Site URL configuration", robots: "robots.txt", sitemap: "Sitemap", content: "Content quality", crawl: "Crawl problems",
};
