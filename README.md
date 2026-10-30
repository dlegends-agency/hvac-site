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

1. Run, in order, in the SQL Editor: `supabase/schema.sql`, `supabase/schema-blog-analytics.sql`, `supabase/schema-directory.sql`, `supabase/schema-contact.sql` (Contact page messages), `supabase/schema-discovery.sql` (business discovery), `supabase/schema-contractors.sql` (contractor accounts, plans, assigned leads), then (optional) `supabase/seed-blog-posts.sql` for 9 starter articles and `supabase/seed-listings.sql` for 24 starter directory listings.
2. Authentication > Users > Add user (auto-confirm), then run the `insert into admin_users` snippet at the bottom of `schema.sql`.
3. Sign in at `/admin/login`. The Overview (`/admin`) auto-refreshes every 30 seconds (Live toggle), shows KPIs vs the previous period, most-viewed cities, and business registrations with Approve / Decline actions. Leads: `/admin/leads`. Blog: `/admin/blog`. Analytics: `/admin/analytics`.

The publishable key is safe in the browser: row level security allows the public to INSERT leads and page views and to
read published posts only; everything else requires a signed-in user listed in `admin_users`. Never use the `service_role` key here.

## Directory

Public: `/directory` (search + state/city/service filters), `/directory/:slug` (listing page with HVACBusiness JSON-LD), `/directory/add` (business submission form, goes to `pending`).
Admin: `/admin/listings` to review, edit, publish or hide listings and add private notes. Submitter contact details are stored in an admin-only table (`listing_private`).
The directory only shows businesses you publish. `supabase/seed-listings.sql` adds 24 real Texas HVAC businesses (6 each for Austin, Dallas, Houston and San Antonio areas) whose details were read from their own websites; see `docs/listing-sources.md`. Licensing, insurance and availability are not verified, and listings are not endorsements. Location pages show up to 6 businesses (matched by city or by the service area the business states) and link to the full directory.

## Homepage photos

Photos in `public/images/` are free-license stock photos from Pexels, cropped and compressed (about 1 MB total). Credits and source pages are in `docs/image-credits.md`.
To swap one, replace the file with the same name and keep its aspect ratio (hero 1400x1186, form-tech 1000x667, faq-family 900x1350, dir-van 800x727, svc-* 800x500).
They are stock images, not photos of this business or its contractors.

## Directory admin and business discovery

`/admin/listings` has search, status/city/source filters, sorting, bulk publish/hide/delete, CSV export and a source badge (submitted, seeded, found by agent, added by admin).
`/admin/listings/discover` ("Find businesses") lets you define searches by location (for example "Austin, TX"), run them, and review the results as candidates with a confidence score and a Verified badge.
A free **discovery agent** (`scripts/discovery-agent`, run by the GitHub Actions workflow `.github/workflows/discovery-agent.yml` every 6 hours) finds HVAC businesses on OpenStreetMap (plus optional web search), visits each business's **own website** to confirm the phone, address and services (robots.txt respected), and drops directories, suppliers and non-contractors. No Google Cloud account or paid API is involved, and Google Maps is not scraped.
Importing a candidate creates a **pending** listing that you review and publish yourself. Setup (GitHub secrets, optional free keys, optional instant "Run now") is in `scripts/discovery-agent/README.md`.

## Contractor accounts, pricing and payments

`/pricing` lists three plans (Basic free, Featured, Premium; edit names, prices and features in `src/config/pricing.ts`, the prices there are placeholders). Contractors sign up at `/contractor/login`, then **claim** their listing (or add their business). An admin approves each claim in **Admin > Directory > Claims** before the account can edit anything.

- **Dashboard** (`/contractor`): profile editor (description, services, areas, contact details), assigned customer requests with status and notes, plan and billing.
- **Featured placement**: Featured and Premium listings get a badge, sort above Basic listings (Premium first) in the directory and on city pages, and are labeled as paid. A paid plan only counts while `plan_until` is empty or in the future.
- **Google stars**: the contractor enters their rating, review count and Google reviews link. It is shown only on paid plans, labeled "Rating reported by the business" with the date it was last updated. It is not verified and is deliberately not added to structured data. Fetching ratings from Google automatically would need the paid Places API, so it is not done.
- **Leads**: you assign a request to a contractor in **Admin > Leads > (a lead) > Assign to a contractor**. Contractors read only their own assigned leads, through database functions, and never the leads table itself.

### Turning on payments (Stripe)

1. Create a Stripe account. In **Product catalogue** create two recurring monthly prices that match `src/config/pricing.ts` (Featured, Premium) and copy their price IDs (`price_...`). Start in **test mode**.
2. In Cloudflare Pages > Settings > Variables and Secrets add (as **Secrets**): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`; and as variables `STRIPE_PRICE_FEATURED`, `STRIPE_PRICE_PREMIUM`. Redeploy afterwards.
   The service role key is used only by the server functions in `functions/api/stripe/` and is never sent to the browser.
3. In Stripe > Developers > Webhooks add the endpoint `https://YOUR-SITE/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. In Stripe > Settings > Billing > Customer portal enable cancelling and plan changes (this is what the "Open billing portal" button uses).
5. Test with card `4242 4242 4242 4242`, then switch Stripe to live mode and replace the keys and price IDs.

Until these are set the Billing page says payments are not switched on yet, and you can still give a listing a plan by hand in **Admin > Directory > (a listing) > Plan**. `npm run test:stripe` checks the webhook signature and plan logic offline.

## Contact, Privacy Policy and Terms

`/contact` (form saved to `contact_messages`; read and reply in `/admin/messages`), `/privacy-policy` and `/terms-of-use`. The policy text describes this site's actual data practices
(request form, contact form, listings, cookie-free analytics, Supabase and Cloudflare as providers). These are good-faith drafts, not legal advice: have a lawyer review them
before launch, especially the sharing-with-contractors language (which can count as a "sale" or "sharing" under some state privacy laws) and any texting consent wording.
Optional env vars: `VITE_LEGAL_ENTITY` (registered business name) and `VITE_LEGAL_GOVERNING_STATE` (adds a governing-law clause). Email, phone and address show on the Contact page only when `VITE_CONTACT_*` are set.

## Logo and brand

The logo files are `public/logo.png` (light backgrounds), `public/logo-light.png` (dark backgrounds), `public/favicon.png`, `public/apple-touch-icon.png` and the default share image `public/og-default.png`.
The brand name is `siteConfig.brand.name` (HVACHelp). The homepage title keeps the keyword phrase "Emergency HVAC Repair | Find Local Heating and AC Help".

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
