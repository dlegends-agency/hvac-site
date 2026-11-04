# functions/api/recommend

## Overview
Customer recommendations for directory listings. A recommendation is always saved (as `pending`); the business reads it in its dashboard and decides whether to show it. If email sending is set up, the customer also confirms their email address.

## Interface
- `submit.ts`: `onRequestPost` for `POST /api/recommend/submit` with `{ slug, name, email, body, used, website }`. `website` is a hidden trap field. Returns `{ ok, message }` or `{ error }`.
- `confirm.ts`: `onRequestGet` for `GET /api/recommend/confirm?t=<token>`. Marks the email confirmed and redirects to `/directory/<slug>?recommendation=confirmed`; other outcomes are a small HTML page.

## Invariants
- 501 only when `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_URL` is missing. Without `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` the recommendation is still saved and no email is sent. If the confirmation email fails, the recommendation is kept.
- Only a published listing can be recommended. The name is stored as first name and last initial. Links and email addresses in the text are refused.
- Limits: 3 per email per day, 6 per sender per day (a salted SHA-256 of `CF-Connecting-IP` in `ip_hash`, never the address), 10 unconfirmed per business per hour, one per email per business (a repeat gets the same reply and no email).
- The emailed token is random; only its SHA-256 hash is stored. A link works once and for 7 days. Confirming never approves: status stays `pending` until the business (or an admin) decides.

## Side Effects
- Supabase REST with the service role key (`listing_recommendations`, `listings`); Resend email to the customer when configured.

## Verification
- Run: `npm run test:recommend`
