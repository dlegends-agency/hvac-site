# Emergency HVAC Repair: lead generation site

React 19 + Vite + TypeScript + Tailwind CSS 4 + React Router + React Hook Form + Zod + Supabase.

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # http://localhost:3100
npm run lint && npm run build
```

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

## Blog covers

Covers are original SVG illustrations in `public/blog/` (no stock photos). Set any image path or URL in the post editor's "Cover image URL" field.

## Notes

- Lead delivery inserts straight from the browser into Supabase. There is no spam protection yet (add Cloudflare Turnstile and/or a rate limit before launch).
- Blog pages render client-side. Google renders JavaScript, but if blog SEO becomes critical consider prerendering.
- Analytics is a cookie-free built-in tracker (path, referrer host, UTM source, device class, random browser id). Mention it in your privacy policy.
- Privacy Policy, Terms and Contact pages are not built; the footer shows them as plain text until `legal.*Href` is set in `src/config/site.ts`.
- Coverage for the example Texas cities is unconfirmed. Set `coverageConfirmed` in `src/config/locations.ts` once it is.
