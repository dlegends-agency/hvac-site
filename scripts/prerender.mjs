// Prerenders public routes to static HTML after `vite build` and `vite build --ssr`.
// Output: dist/<route>/index.html with real content, title, description, canonical, Open Graph and JSON-LD.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const dist = "dist";
const { render, prerenderRoutes, siteUrl, brandName } = await import(pathToFileURL(join(".ssr", "entry-server.js")).href);

const template = await readFile(join(dist, "index.html"), "utf8");
if (!template.includes("<!--seo:start-->") || !template.includes('<div id="root"></div>')) {
  throw new Error("index.html is missing the seo markers or the root element.");
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const abs = (p) => `${siteUrl}${p === "/" ? "" : p}`;

function head(meta) {
  const tags = [`<title>${esc(meta.title)}</title>`];
  if (meta.description) tags.push(`<meta name="description" content="${esc(meta.description)}" />`);
  tags.push(`<meta property="og:title" content="${esc(meta.title)}" />`);
  if (meta.description) tags.push(`<meta property="og:description" content="${esc(meta.description)}" />`);
  tags.push(`<meta property="og:type" content="${meta.type ?? "website"}" />`);
  tags.push(`<meta property="og:site_name" content="${esc(brandName)}" />`);
  if (meta.path !== undefined) {
    tags.push(`<meta property="og:url" content="${esc(abs(meta.path))}" />`);
    tags.push(`<link rel="canonical" href="${esc(abs(meta.path))}" />`);
  }
  const image = meta.image ?? "/og-default.png";
  tags.push(`<meta property="og:image" content="${esc(image.startsWith("http") ? image : siteUrl + image)}" />`);
  tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  if (meta.noindex) tags.push(`<meta name="robots" content="noindex, nofollow" />`);
  const ld = meta.jsonLd ? (Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd]) : [];
  for (const data of ld) {
    tags.push(`<script type="application/ld+json" data-seo-jsonld>${JSON.stringify(data).replace(/</g, "\u003c")}</script>`);
  }
  return tags.join("\n    ");
}

const seoBlock = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
let count = 0;

for (const route of prerenderRoutes) {
  const { html, meta } = render(route);
  if (!meta) throw new Error(`No SEO metadata recorded for ${route}`);
  let page = template.replace(seoBlock, `<!--seo:start-->\n    ${head(meta)}\n    <!--seo:end-->`);
  page = page.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  const file = route === "/" ? join(dist, "index.html") : join(dist, route.slice(1), "index.html");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page);
  count++;
}

// Point robots.txt at the real sitemap URL.
try {
  const robotsPath = join(dist, "robots.txt");
  const robots = await readFile(robotsPath, "utf8");
  await writeFile(robotsPath, robots.replace(/Sitemap: .*/g, `Sitemap: ${siteUrl}/sitemap.xml`));
} catch {
  // robots.txt is optional
}

console.log(`Prerendered ${count} routes.`);
