# functions Blueprint

## System Overview
Cloudflare Pages Functions for the HVAC directory site. They run server side on Workers, use `fetch` only (no SDKs), and talk to Supabase, Stripe, Google Places, Resend and GitHub. Secrets such as `SUPABASE_SERVICE_ROLE_KEY` stay here and never reach the browser.

## Local Interface & Invariants
- `sitemap.xml.ts`: `onRequestGet` for `/sitemap.xml`. Builds the sitemap from static pages, `servicePages` (`src/config/serviceContent`), `locations` (`src/config/locations`), and `published` rows of the `posts` and `listings` tables read with the publishable key. Missing Supabase vars or fetch errors yield no dynamic rows rather than an error. Site base is `VITE_SITE_URL` or the request origin. Response is XML with `Cache-Control: public, max-age=300`.

## Subdirectories & System Boundaries
- _lib: [./_lib/README.md](./_lib/README.md) - shared Stripe, Supabase, Google, and email helpers (not routed).
- api: [./api/README.md](./api/README.md) - `/api` routes, including `run-discovery`.
- api/google: [./api/google/README.md](./api/google/README.md) - Google business linking and live ratings.
- api/notify: [./api/notify/README.md](./api/notify/README.md) - lead alert emails.
- api/stripe: [./api/stripe/README.md](./api/stripe/README.md) - billing, lead unlock, webhook.

## Global Invariants
- Plans and unlocked leads are granted only by the Stripe webhook after signature verification.
- Lead emails never contain customer contact details.
- Google ratings are fetched live and never stored.
- Endpoints return 501 when their required environment variables are not configured.

## Global Side Effects
- External services: Supabase REST/RPC, Stripe, Google Places, Resend, GitHub Actions dispatch.

## System Verification
- Run: `npm run test:stripe`, `npm run test:google`, `npm run test:notify`, `npm run test:account`, `npm run test:unlock` (there is no `test` script); `npm run lint`; `npx tsc --noEmit`
