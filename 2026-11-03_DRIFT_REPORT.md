# Drift report, 2026-11-03

Scope: the 21 new READMEs and 2 edited READMEs from the bootstrap run, checked against source by four read-only reviewers.
Spot-checked by the orchestrator: items marked **(confirmed)**. All other items are reviewer findings not re-verified.

## Wrong claims (README says something the code contradicts)

- `functions/README.md`: "Endpoints return 501 when env vars are missing" is not universal. `functions/api/google/rating.ts:12` returns 200 `{rating:null}`; `functions/sitemap.xml.ts:17` omits dynamic rows instead.
- `functions/api/google/README.md`: "`link` returns 404 if the listing row is missing" only holds when `placeId` is not null. **(confirmed)** `link.ts:20-23` skips the lookup for `placeId: null` (disconnect).
- `functions/_lib/README.md`: "a paid plan counts only until `plan_until`". In `google.ts:40` a paid plan with null `plan_until` counts as paid with no expiry.
- `functions/_lib/README.md`: alert email "only the issue, urgency and a dashboard link". `email.ts:36-59` also includes business name, received time, and an alerts-off link; urgency only changes the subject prefix and banner.
- `src/components/admin/README.md`: "App.tsx lazy-loads these screens" is too broad. `AdminShell`, `DirectoryTabs` and `LoginForm` are imported eagerly.
- `src/components/contractor/README.md`: lists `listing_private` and `lead_assignments` as used there; neither is queried in that folder.
- `scripts/discovery-agent/README.md`: "about 1 request per second" overstates the throttle (only an 800 ms pause between a site's two pages, 3 sites in parallel; `site.mjs:183,194`, `agent.mjs:117`). "matched by website, phone and name" is looser than `db.mjs:15-33`.
- `supabase/README.md`: "every file is re-runnable" is unsafe for `schema-discovery.sql` after `schema-contractors.sql`. **(confirmed)** `schema-discovery.sql:9` drops `listings.google_place_id`, which holds data and is re-added by `schema-contractors.sql`.
- `supabase/README.md`: `my_leads()` "withholds customer fields until unlocked" — before unlock it still returns `issue`, `first_name`, `last_name`.
- `supabase/README.md`: `protect_listing_fields()` bypass also includes `auth.uid() is null` (SQL editor).
- `supabase/README.md`: `route_lead` `p_max` caps total assignments per lead and fills only remaining slots; spam leads return 0; only published listings with a `listing_owners` row qualify.

## Possible code defect found during review (not a README error)

- `functions/api/stripe/webhook.ts:72`: **(confirmed)** `JSON.parse(payload)` runs outside the `try`. A validly signed, non-JSON body throws an unhandled exception instead of returning a status. Low risk (needs a valid signature).

## Omissions (README is silent on real behaviour)

**functions/**
- `sitemap.xml.ts`: static page list, `lastmod` tags, single-trailing-slash strip.
- `api/stripe`: `checkout` returns 501 if the price env var for the interval is unset; `plan`/`interval` default to `featured`/`month`; `unlock` 404 covers missing assignment, listing or lead; `account` empty-customer response and invoice shape; webhook `listing_id` source order and written `listing_billing` columns; portal `return_url` per flow.
- `api/notify`: 502 when the claim RPC fails; finish RPC skipped when nothing was claimed; `failed` is a count but `p_failed` is an id-to-error map.
- `api/google`: `link` success body `{ok:true}`, 400/502 cases; `rating` 400 body.
- `api`: `run-discovery` 501 check order (GitHub vars, then Supabase vars), 502 message includes GitHub status.
- `_lib`: `searchPlaces` sends `maxResultCount: 5`, `regionCode: "US"`; `placeRating` rounding; `priceFor` ignores `plan`; `entitlement` period-end fallback.

**src/**
- `src/README.md`: global `ScrollManager`, `RevealManager`, `PageViewTracker` mounted in `App.tsx:50-52`; `entry-server.tsx:14` pre-render `takeSeo()` reset; `/contractor/profile` redirect.
- `src/components/README.md`: `PageViewTracker` skips `/admin*`, `/contractor*`, `?seo_audit=1`, Do Not Track, and consecutive duplicate paths.
- `src/components/admin/README.md`: tables list omits `lead_assignments`; `LoginForm` also uses `supabase.auth`; `window.confirm` before deletes; CSV downloads.
- `src/components/contractor/README.md`: omits `/api/stripe/checkout`; `supabase.auth` also used in `api.ts`, `ContractorLoginPage`, `ContractorAccount`.
- `src/config/README.md`: "no side effects" but `site.ts` reads six `VITE_*` env vars; omits the `leadPrice` / `LEAD_PRICE_CENTS` match requirement and the `PlanId` import from `lib/types`.
- `src/lib/README.md`: omits `leads` read in `useLeads`, `ContractorLeadStatus`, `publicView` also hiding `emergency_service`, `submitLead` treating Postgres `23505` as success, JSON-LD/canonical/og head writes in `usePageMeta`, `lead-events` fallback navigation.
- `src/lib/seo-audit/README.md`: omits `?seo_audit=1` coupling to `PageViewTracker`, `robots.txt`/`sitemap.xml` fetches, `posts`/`listings` reads, iframe in `document.body`.
- `src/pages/README.md`: omits `AddBusinessPage` insert into `listing_private`; `TermsPage` imports `LEGAL_UPDATED` from `PrivacyPage`; `usePageMeta({noindex:true})` on two pages.

**scripts/ and supabase/**
- `discovery-agent/README.md`: also reads `listing_candidates` and `discovery_jobs`; checks at most `2 * max_results` leads; drops supplier-like names and leads without phone or website; `isDue` intervals; extra exit-1 cases.
- `supabase/README.md`: `claim_lead_notifications` details (alerts-off marking, 5 attempts, 5-minute reclaim); unlisted columns (`listing_claims.user_email`, `listing_billing.billing_interval`, `lead_assignments` unlock/status columns); `seed-listings.sql` also inserts `listing_private` rows.

## No drift detected

`scripts/README.md`, `src/components/directory`, `form`, `sections`, `seo`, `ui`.

## Not covered

Root `README.md` Blueprint section was not part of the review; its claims were spot-checked during bootstrap only.
