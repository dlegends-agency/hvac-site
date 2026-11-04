# scripts Blueprint

## System Overview

Node ESM (`.mjs`) utilities for the HVAC site: the build-time prerenderer, a one-time data loader, the free business-discovery agent, and offline test scripts that exercise the Cloudflare Pages Functions under `functions/`. All scripts are wired up through `package.json` scripts.

## Local Interface & Invariants

| File | Role | npm script |
| --- | --- | --- |
| `prerender.mjs` | After `vite build` and `vite build --ssr`, imports `.ssr/entry-server.js` (`render`, `prerenderRoutes`, `siteUrl`, `brandName`) and writes `dist/<route>/index.html` with title, description, canonical, Open Graph and JSON-LD. Rewrites the `Sitemap:` line in `dist/robots.txt`. | `build` (last step) |
| `load-zip-centroids.mjs` | One-time load of `supabase/data/zip-centroids.csv.gz` into the `zip_centroids` table (upsert on `zip`, batches of 1000). Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. | none (run with `node`) |
| `ts-resolve.mjs` | Registers a `node:module` resolve hook so extensionless relative imports in `functions/` resolve to `.ts`. Loaded with `--import`. | used by `test:notify`, `test:account`, `test:unlock`, `test:recommend` |
| `test-stripe.mjs` | Tests `functions/_lib/stripe.ts` (webhook signature, plan and price mapping, entitlement). | `test:stripe` |
| `test-google.mjs` | Tests `functions/_lib/google.ts` (place ids, candidates, ratings, `isPaidNow`). | `test:google` |
| `test-recommend.mjs` | Tests `functions/_lib/recommend.ts`, `functions/api/recommend/*` (with `fetch` mocked), `src/lib/hours.ts` and `parseHours`. | `test:recommend` |
| `test-notify.mjs` | Tests `functions/_lib/email.ts` and `functions/api/notify/send.ts` with `fetch` mocked. | `test:notify` |
| `test-account.mjs` | Tests `functions/api/stripe/account.ts` and `portal.ts` with `fetch` mocked. | `test:account` |
| `test-unlock.mjs` | Tests `unlock.ts`, `checkout.ts`, `webhook.ts` and checks `src/config/pricing.ts` `leadPrice` matches `LEAD_PRICE_CENTS`. | `test:unlock` |

Invariants:

- `prerender.mjs` throws if `dist/index.html` lacks the `<!--seo:start-->` marker or `<div id="root"></div>`, or if a route yields no SEO metadata.
- `load-zip-centroids.mjs` exits 1 without the two env vars and is idempotent (upsert).
- Test scripts replace `globalThis.fetch` and make no real network calls. Each prints an "all passed" line and fails via `node:assert` otherwise.
- Alert emails must not reveal the customer's city or state (checked in `test-notify.mjs`); the website and server lead prices must agree (checked in `test-unlock.mjs`).

Side effects:

- `prerender.mjs` writes files under `dist/`.
- `load-zip-centroids.mjs` writes to Supabase.
- Test scripts have none beyond reading source files.

## Subdirectories & System Boundaries

- discovery-agent: [./discovery-agent/README.md](./discovery-agent/README.md) - free contractor discovery agent (OpenStreetMap, optional Tavily and LLM, site checks) that saves review candidates to Supabase.

## Global Invariants

- Scripts are ESM; they use Node built-ins, `@supabase/supabase-js`, and `cheerio` (discovery agent HTML parsing).
- Service role credentials are read from environment variables only.

## Global Side Effects

- Supabase (service role): `zip_centroids`, `listing_candidates`, `discovery_jobs`, `discovery_runs`.
- Filesystem: `dist/` during build.

## System Verification

- Run: `npm run discover:test`, `npm run test:stripe`, `npm run test:google`, `npm run test:notify`, `npm run test:account`, `npm run test:unlock` (`package.json` has no `test` script). All six pass.
