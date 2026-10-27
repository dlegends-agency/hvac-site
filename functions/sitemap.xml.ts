// Cloudflare Pages Function: builds /sitemap.xml from published posts so it never lists unpublished URLs.
interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SITE_URL?: string;
}

interface Row {
  slug: string;
  updated_at: string;
}

async function fetchRows(env: Env, table: string): Promise<Row[]> {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) return [];
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=slug,updated_at&status=eq.published`, {
      headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    });
    return res.ok ? ((await res.json()) as Row[]) : [];
  } catch {
    return [];
  }
}

export const onRequestGet = async ({ env, request }: { env: Env; request: Request }) => {
  const site = (env.VITE_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const [posts, listings] = await Promise.all([fetchRows(env, "posts"), fetchRows(env, "listings")]);

  const urls = [
    `<url><loc>${site}/</loc><changefreq>monthly</changefreq><priority>1</priority></url>`,
    `<url><loc>${site}/blog</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    `<url><loc>${site}/directory</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    ...posts.map((p) => `<url><loc>${site}/blog/${encodeURIComponent(p.slug)}</loc><lastmod>${p.updated_at}</lastmod><priority>0.7</priority></url>`),
    ...listings.map((l) => `<url><loc>${site}/directory/${encodeURIComponent(l.slug)}</loc><lastmod>${l.updated_at}</lastmod><priority>0.6</priority></url>`),
  ];

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
};
