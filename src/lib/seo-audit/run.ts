import { staticRoutes } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import {
  analyzePage, analyzeRawHtml, crossPageIssues, normalizePath,
  type AuditContext, type Issue, type PageKind, type PageResult,
} from "./rules";

export interface AuditReport {
  startedAt: string;
  durationMs: number;
  siteUrl: string;
  isDev: boolean;
  pages: PageResult[];
  /** Page-level, cross-page and site-wide issues combined. */
  issues: Issue[];
}

interface Target {
  path: string;
  kind: PageKind;
}

const POOL = 3;
const PAGE_TIMEOUT_MS = 10000;

/** Loads a page in an off-screen same-origin frame, waits for it to render, and analyses the live DOM. */
function auditInFrame(target: Target, ctx: AuditContext): Promise<PageResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:visible";
    // seo_audit=1 stops the page view tracker from counting audit visits.
    frame.src = `${target.path === "/" ? "/" : target.path}?seo_audit=1`;
    const started = Date.now();
    let done = false;

    const finish = (result: PageResult) => {
      if (done) return;
      done = true;
      frame.remove();
      resolve(result);
    };

    const failed = (message: string): PageResult => ({
      url: target.path, kind: target.kind, title: "", titleLen: 0, description: "", descLen: 0, canonical: "", h1Count: 0, h1: "",
      words: 0, images: 0, imagesNoAlt: 0, schemaTypes: [], internalLinks: [], externalLinks: 0, rawChecked: false,
      issues: [{ rule: "crawl", severity: "error", url: target.path, message }],
    });

    frame.onload = () => {
      const poll = () => {
        try {
          const doc = frame.contentDocument;
          const ready = doc && doc.querySelector("h1") && !/Loading/.test(doc.querySelector("main")?.textContent?.slice(0, 200) ?? "");
          if (ready || Date.now() - started > PAGE_TIMEOUT_MS) {
            if (!doc || !doc.querySelector("h1")) return finish(failed("The page didn't finish rendering (no H1 after 10 seconds)."));
            // A short settle for late client-side head updates.
            setTimeout(() => {
              try {
                finish(analyzePage(frame.contentDocument!, target.path, target.kind, ctx));
              } catch (e) {
                finish(failed(`Could not analyse the page: ${(e as Error).message}`));
              }
            }, 400);
            return;
          }
        } catch (e) {
          return finish(failed(`Could not read the page: ${(e as Error).message}`));
        }
        setTimeout(poll, 250);
      };
      poll();
    };
    document.body.appendChild(frame);
  });
}

async function fetchText(path: string): Promise<{ ok: boolean; text: string; type: string }> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    return { ok: res.ok, text: await res.text(), type: res.headers.get("content-type") ?? "" };
  } catch {
    return { ok: false, text: "", type: "" };
  }
}

async function siteChecks(ctx: AuditContext, expectedPaths: string[]): Promise<Issue[]> {
  const issues: Issue[] = [];
  const add = (rule: string, severity: Issue["severity"], message: string, detail?: string) => issues.push({ rule, severity, message, detail });
  const siteHost = (() => {
    try {
      return new URL(ctx.siteUrl).host;
    } catch {
      return "";
    }
  })();

  // Site URL
  if (/localhost|127\.0\.0\.1/.test(ctx.siteUrl)) {
    add("site-url", ctx.isDev ? "info" : "error", "VITE_SITE_URL isn't set, so canonical URLs and the sitemap use localhost.", ctx.siteUrl);
  } else if (ctx.siteUrl.startsWith("http://")) {
    add("site-url", "warning", "Site URL uses http, not https.", ctx.siteUrl);
  }

  // robots.txt
  const robots = await fetchText("/robots.txt");
  if (!robots.ok || /<html/i.test(robots.text)) add("robots", "error", "robots.txt wasn't found.");
  else {
    if (/^\s*Disallow:\s*\/\s*$/im.test(robots.text)) add("robots", "error", "robots.txt blocks the whole site (Disallow: /).");
    const sm = robots.text.match(/^\s*Sitemap:\s*(\S+)/im)?.[1];
    if (!sm) add("robots", "warning", "robots.txt doesn't list a Sitemap.");
    else if (siteHost && new URL(sm).host !== siteHost) add("robots", "warning", "The sitemap URL in robots.txt is on a different host than the site URL.", sm);
    if (!/Disallow:\s*\/admin/i.test(robots.text)) add("robots", "info", "robots.txt doesn't disallow /admin (the admin pages are already noindex).");
  }

  // sitemap.xml
  const sitemap = await fetchText("/sitemap.xml");
  const xml = new DOMParser().parseFromString(sitemap.text, "application/xml");
  if (!sitemap.ok || xml.querySelector("parsererror") || !xml.querySelector("urlset")) {
    add("sitemap", ctx.isDev ? "info" : "error", ctx.isDev ? "The sitemap is served by a Cloudflare Pages Function, so it isn't available on the local dev server." : "sitemap.xml wasn't found or isn't valid XML.");
  } else {
    const locs = [...xml.querySelectorAll("url > loc")].map((l) => l.textContent?.trim() ?? "");
    const paths = locs.map((l) => {
      try {
        const u = new URL(l);
        if (siteHost && u.host !== siteHost) add("sitemap", "warning", "Sitemap URL is on a different host than the site URL.", l);
        return normalizePath(u.pathname);
      } catch {
        add("sitemap", "error", "Sitemap contains an invalid URL.", l);
        return "";
      }
    });
    if (paths.some((p) => p.startsWith("/admin"))) add("sitemap", "error", "Sitemap lists admin URLs.");
    if (new Set(locs).size !== locs.length) add("sitemap", "warning", "Sitemap contains duplicate URLs.");
    const missing = expectedPaths.filter((p) => !paths.includes(p));
    if (missing.length) add("sitemap", "warning", `${missing.length} published page(s) are missing from the sitemap.`, missing.join(", "));
    add("sitemap", "info", `Sitemap lists ${locs.length} URLs.`);
  }
  return issues;
}

/** Runs the full audit. Calls onProgress(done, total, currentPath) as pages are processed. */
export async function runAudit(onProgress: (done: number, total: number, path: string) => void): Promise<AuditReport> {
  const started = Date.now();
  const isDev = import.meta.env.DEV;
  const targets: Target[] = staticRoutes.map((path) => ({ path, kind: "static" }));
  const contentIssues: Issue[] = [];

  // Published content from Supabase
  if (isSupabaseConfigured) {
    const supabase = getSupabaseBrowser();
    const [posts, listings] = await Promise.all([
      supabase.from("posts").select("slug,title,excerpt,meta_description,cover_image,content").eq("status", "published"),
      supabase.from("listings").select("slug,business_name,description,phone").eq("status", "published"),
    ]);
    for (const p of (posts.data ?? []) as { slug: string; title: string; excerpt: string | null; meta_description: string | null; cover_image: string | null; content: string }[]) {
      const path = `/blog/${p.slug}`;
      targets.push({ path, kind: "post" });
      const add = (severity: Issue["severity"], message: string) => contentIssues.push({ rule: "content", severity, message, url: path });
      if (!p.meta_description) add("warning", "Post has no meta description (the excerpt or nothing is used instead).");
      if (!p.excerpt) add("info", "Post has no excerpt (shown on the blog list and used as a fallback description).");
      if (!p.cover_image) add("info", "Post has no cover image.");
      if (p.content.split(/\s+/).filter(Boolean).length < 300) add("warning", "Post body is under 300 words.");
    }
    for (const l of (listings.data ?? []) as { slug: string; business_name: string; description: string | null; phone: string | null }[]) {
      const path = `/directory/${l.slug}`;
      targets.push({ path, kind: "listing" });
      const add = (severity: Issue["severity"], message: string) => contentIssues.push({ rule: "content", severity, message: `${l.business_name}: ${message}`, url: path });
      if (!l.description || l.description.length < 100) add("warning", "Listing description is missing or under 100 characters.");
      if (!l.phone) add("info", "Listing has no phone number.");
    }
  }

  const ctx: AuditContext = {
    siteUrl: siteConfig.url,
    isDev,
    homeTitle: siteConfig.seo.title,
    knownPaths: new Set([...targets.map((t) => normalizePath(t.path)), "/directory/add"]),
  };

  // Crawl with a small pool
  const results: PageResult[] = new Array(targets.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < targets.length) {
      const i = next++;
      const target = targets[i];
      const [page, raw] = await Promise.all([
        auditInFrame(target, ctx),
        !isDev && target.kind === "static" ? fetchText(target.path) : Promise.resolve(null),
      ]);
      if (raw) {
        page.rawChecked = true;
        page.issues.push(...(raw.ok ? analyzeRawHtml(raw.text, target.path, ctx) : [{ rule: "crawl", severity: "error" as const, url: target.path, message: "Server returned an error for this page." }]));
      }
      results[i] = page;
      onProgress(++done, targets.length, target.path);
    }
  };
  onProgress(0, targets.length, "");
  await Promise.all(Array.from({ length: POOL }, worker));

  // The add-business form page is deliberately left out of the sitemap.
  const expectedInSitemap = targets.map((t) => normalizePath(t.path)).filter((p) => p !== "/directory/add");
  const site = await siteChecks(ctx, expectedInSitemap);
  const issues = [...results.flatMap((r) => r.issues), ...crossPageIssues(results), ...contentIssues, ...site];

  return { startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, siteUrl: ctx.siteUrl, isDev, pages: results, issues };
}

export function issuesToCsv(report: AuditReport): string {
  const esc = (s: string | undefined) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["severity", "rule", "url", "message", "detail"].join(",")];
  for (const i of report.issues) rows.push([i.severity, i.rule, i.url ?? "(site-wide)", i.message, i.detail ?? ""].map(esc).join(","));
  return rows.join("\n");
}
