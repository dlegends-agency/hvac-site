# functions/api/stripe

## Overview
Billing endpoints for contractors: subscription checkout, billing portal, account/payment history, pay-per-lead unlock, and the Stripe webhook that is the only path turning payments into a plan or an unlocked lead. Helpers come from [`../../_lib`](../../_lib/README.md).

## Interface
- `checkout.ts`: `POST /api/stripe/checkout` `{ plan: "featured", interval: "month" | "year" }` (bearer token). Returns `{ url }` for a subscription Checkout session.
- `portal.ts`: `POST /api/stripe/portal` `{ flow?: "card" }` (bearer token). Returns `{ url }` for Stripe's billing portal; `flow: "card"` deep-links to payment method update and falls back to the normal portal.
- `account.ts`: `POST /api/stripe/account` (bearer token). Returns `{ card, subscription, invoices }` (brand, last4, expiry only; non-draft invoices, up to 24).
- `unlock.ts`: `POST /api/stripe/unlock` `{ leadId }` (bearer token). Returns `{ url, cents }` for a one-time Checkout payment.
- `webhook.ts`: `POST /api/stripe/webhook`. Handles `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `customer.subscription.*`; returns `{ received: true }`.

## Invariants
- Every endpoint except the webhook needs a signed-in user (401) who owns a listing (403); all return 501 when `STRIPE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is missing (the webhook also needs `STRIPE_WEBHOOK_SECRET`).
- `checkout` refuses a listing already `active`, `trialing` or `past_due` (409) and unknown plan/interval (400).
- `unlock` validates `leadId` as a UUID (400); the lead must be assigned to the caller's listing (404) and not already unlocked (409). The price is set server side: `LEAD_PRICE_CENTS.paid` if `isPaidNow(listing)`, else `LEAD_PRICE_CENTS.free`. Metadata `kind: "lead_unlock"`, `lead_id`, `listing_id` is placed on the session and the payment intent.
- `webhook` rejects invalid signatures with 400, returns 500 on processing errors so Stripe retries, and ignores subscriptions without a `listing_id`. Sessions with `mode === "payment"` unlock only when `metadata.kind === "lead_unlock"` and `payment_status === "paid"`. Upserts of `listing_billing` use `on_conflict=listing_id` with merge-duplicates; unlock writes only `stripe_customer_id` so subscription columns are kept.
- `portal` returns 404 if the listing has no `stripe_customer_id`.

## Side Effects
- Stripe API calls: Checkout sessions, billing portal sessions, invoices, subscriptions, customers, payment methods.
- Supabase writes (webhook): upsert `listing_billing`, `PATCH listings` (`plan`, `plan_until`), `rpc/unlock_lead` (`p_lead`, `p_listing`, `p_cents`, `p_ref`).

## Verification
- Run: `npm run test:stripe`, `npm run test:account`, `npm run test:unlock`
