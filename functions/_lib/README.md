# functions/_lib

## Overview
Shared helpers for the Cloudflare Pages Functions. The leading underscore keeps this folder from being routed as an endpoint. No Stripe SDK is used: Stripe, Supabase, Resend and Google Places are all called with `fetch`, so the code runs on Cloudflare Workers as is.

## Interface
- `stripe.ts`
  - `Env`: bindings and secrets shared by all functions (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_FEATURED`, `STRIPE_PRICE_FEATURED_YEARLY`, `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `NOTIFY_SECRET`, `GOOGLE_PLACES_API_KEY`).
  - Types and constants: `Plan` (`"featured"`), `Interval` (`"month" | "year"`), `LEAD_PRICE_CENTS` (`free: 1000`, `paid: 500`), `BillingRow`, `StripeSubscription`.
  - `json(body, status)`, `isPlan`, `isInterval`, `priceFor`, `planForPrice`, `intervalForPrice`, `siteOrigin`.
  - `stripe<T>(env, method, path, params)`: Stripe REST call (form-encoded POST body, query string for GET); throws `Stripe <status>: <message>` on non-2xx.
  - `getUser(env, request)`: resolves `{ id, email }` from the bearer Supabase token, or `null`.
  - `db(env, path, init)`: Supabase REST call with the service role key.
  - `ownedListingId(env, userId)`, `billingFor(env, listingId)`.
  - `verifyStripeSignature(payload, header, secret, nowSeconds?, toleranceSeconds = 300)`: HMAC-SHA256 check of `Stripe-Signature`.
  - `entitlement(env, sub)`: maps a subscription to `{ plan, until, interval }`.
- `google.ts`: `Candidate`, `Rating`, `isPlaceId`, `parseCandidates`, `parseRating`, `parseHours`, `isPaidNow`, `searchPlaces`, `placeLive` (rating and opening hours in one request).
- `email.ts`: `LeadAlert`, `escapeHtml`, `secretsMatch`, `renderLeadEmail`, `sendEmail`.

## Invariants
- `LEAD_PRICE_CENTS` must stay in step with `leadPrice` in `src/config/pricing.ts` (comment in `stripe.ts`).
- `SUPABASE_SERVICE_ROLE_KEY` is server side only and is never sent to the browser.
- `verifyStripeSignature` returns false for a missing header or secret, a missing `t`/`v1`, or a timestamp more than 300 seconds off; signatures are compared in constant time.
- `entitlement` returns plan `"free"` unless the price maps to a known plan, the status is `active`, `trialing` or `past_due`, and a period end exists. `past_due` keeps the plan until the paid period ends.
- `isPaidNow` is false for a missing or `"free"` plan; a paid plan counts only until `plan_until`.
- `parseCandidates` drops entries without a valid place id or name and returns at most 5. `parseRating` returns `null` unless the rating is a number from 1 to 5, and only accepts `https` google.com map URLs.
- Only the Google place ID is persisted; ratings are fetched live (Google terms forbid caching).
- `renderLeadEmail` never includes customer name, phone, email or address; only the issue (single line, max 200 chars), urgency and a dashboard link. All interpolated HTML is passed through `escapeHtml`.
- `secretsMatch` is constant-time and false if either value is empty or lengths differ.

## Side Effects
- Network: `api.stripe.com/v1`, `${VITE_SUPABASE_URL}/auth/v1/user` and `/rest/v1/*`, `places.googleapis.com/v1` (`places:searchText`, `places/<id>`), `api.resend.com/emails`.
- `sendEmail` sends a real email through Resend and throws `Resend <status>[: detail]` on failure.
- `db` calls may read or mutate Supabase data, depending on the caller.

## Verification
- Run: `npm run test:stripe`, `npm run test:google`, `npm run test:notify`
- Type check: `npx tsc --noEmit`; lint: `npm run lint`
