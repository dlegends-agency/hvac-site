# Emergency HVAC Repair: lead generation site

React 19 + Vite + TypeScript + Tailwind CSS 4 + React Router + React Hook Form + Zod + Supabase.

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # http://localhost:3100
npm run lint && npm run build
```

## SEO and prerendering

`npm run build` runs the client build, an SSR build of `src/entry-server.tsx`, then `scripts/prerender.mjs`, which writes real HTML
(content, title, description, canonical, Open Graph, JSON-LD) to `dist/<route>/index.html` for the homepage, `/services/*`,
`/hvac-contractor-*`, `/blog`, `/directory` and `/directory/add`. The browser then hydrates it. Blog posts and directory listings
load from Supabase in the browser (their titles and schema are set client-side).
Set `VITE_SITE_URL` (no trailing slash needed) before building, since canonical URLs and sitemap entries use it.
Do not add a `404.html` or a catch-all `_redirects`, or Cloudflare will stop serving the prerendered pages and SPA fallback.

- Location pages: edit `src/config/locations.ts` (add a location and it gets a page, a route, footer link and sitemap entry on the next build).
- Service guides: edit `src/config/serviceContent.ts`. The keyword-to-page map is in `docs/keyword-map.md`.

## SEO audit (admin)

`/admin/seo-audit` crawls every public page (static routes, published posts, published listings) in a hidden frame and reports
titles, meta descriptions, canonicals, headings, structured data, image alt text, internal and broken links, duplicates and orphan pages.
On the deployed site it also checks the raw server HTML, robots.txt and sitemap.xml. Results can be exported as CSV. Run it on production for full results:
on the dev server the server-HTML and sitemap checks are skipped. Audit visits are excluded from analytics (`?seo_audit=1`).

## Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL` (+ optional `VITE_CONTACT_*`) |

`VITE_*` variables are baked in at build time, so redeploy after changing them. `public/_redirects` makes deep links work
(single-page app) and `functions/sitemap.xml.ts` serves a dynamic sitemap of published posts only.
Replace the domain in `public/robots.txt` with your real one.

## Where things live

| Path | Purpose |
| --- | --- |
| `index.html` | Static homepage title, description and Open Graph tags (visible to crawlers without JS) |
| `src/App.tsx` | Routes: `/`, `/blog`, `/blog/:slug`, `/admin/*` |
| `src/pages/` | Public pages |
| `src/config/` | Brand, nav, services, locations, FAQ, form/country rules |
| `src/lib/lead-schema.ts` | Zod validation for the lead form |
| `src/lib/submit-lead.ts` | Inserts a lead into Supabase |
| `src/lib/use-page-meta.ts` | Per-page title, description, canonical, Open Graph, JSON-LD |
| `src/components/form/` | Reusable multi-step `LeadCaptureForm` |
| `src/components/admin/` | Admin: overview, leads list and detail, blog editor, analytics |
| `supabase/` | SQL to run in the Supabase SQL Editor |

## Supabase setup

1. Run, in order, in the SQL Editor: `supabase/schema.sql`, `supabase/schema-blog-analytics.sql`, `supabase/schema-directory.sql`, then (optional) `supabase/seed-blog-posts.sql` for 9 starter articles.
2. Authentication > Users > Add user (auto-confirm), then run the `insert into admin_users` snippet at the bottom of `schema.sql`.
3. Sign in at `/admin/login`. Leads: `/admin/leads`. Blog: `/admin/blog`. Analytics: `/admin/analytics`.

The publishable key is safe in the browser: row level security allows the public to INSERT leads and page views and to
read published posts only; everything else requires a signed-in user listed in `admin_users`. Never use the `service_role` key here.

## Directory

Public: `/directory` (search + state/city/service filters), `/directory/:slug` (listing page with HVACBusiness JSON-LD), `/directory/add` (business submission form, goes to `pending`).
Admin: `/admin/listings` to review, edit, publish or hide listings and add private notes. Submitter contact details are stored in an admin-only table (`listing_private`).
No listings are pre-filled: the directory only shows real businesses you publish. Listings are unverified and say so on the page.

## Homepage photos

Photos in `public/images/` are free-license stock photos from Pexels, cropped and compressed (about 1 MB total). Credits and source pages are in `docs/image-credits.md`.
To swap one, replace the file with the same name and keep its aspect ratio (hero 1400x1186, form-tech 1000x667, faq-family 900x1098, dir-van 800x727, svc-* 800x500).
They are stock images, not photos of this business or its contractors.

## Motion

Entrance animations are CSS only (`src/index.css`). Scroll reveals use `data-reveal` plus `RevealManager` (IntersectionObserver); content is fully visible without JavaScript, and all motion is disabled for visitors who prefer reduced motion.

## Blog covers

Covers are original SVG illustrations in `public/blog/` (no stock photos). Set any image path or URL in the post editor's "Cover image URL" field.

## Notes

- Lead delivery inserts straight from the browser into Supabase. There is no spam protection yet (add Cloudflare Turnstile and/or a rate limit before launch).
- Blog pages render client-side. Google renders JavaScript, but if blog SEO becomes critical consider prerendering.
- Analytics is a cookie-free built-in tracker (path, referrer host, UTM source, device class, random browser id). Mention it in your privacy policy.
- Privacy Policy, Terms and Contact pages are not built; the footer shows them as plain text until `legal.*Href` is set in `src/config/site.ts`.
- Coverage for the example Texas cities is unconfirmed. Set `coverageConfirmed` in `src/config/locations.ts` once it is.
