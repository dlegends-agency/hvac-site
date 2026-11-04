# functions/api/recommend

## Overview
Customer recommendations for directory listings. A recommendation is saved privately, the customer confirms their email, and an admin approves it before it is public.

## Interface
- `submit.ts`: `onRequestPost` for `POST /api/recommend/submit` with `{ slug, name, email, body, used, website }`. `website` is a hidden trap field. Returns `{ ok, message }` or `{ error }`.
- `confirm.ts`: `onRequestGet` for `GET /api/recommend/confirm?t=<token>`. Marks the email confirmed and redirects to `/directory/<slug>?recommendation=confirmed`; other outcomes are a small HTML page.

## Invariants
- 501 when `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` or `NOTIFY_FROM_EMAIL` is missing (submit). The form then shows "not switched on yet".
- Only a published listing can be recommended. The name is stored as first name and last initial. Links and email addresses in the text are refused.
- Limits: 3 submissions per email per day, 10 unconfirmed per business per hour, one per email per business (a repeat gets the same reply and no email).
- The emailed token is random; only its SHA-256 hash is stored. A link works once and for 7 days. Confirming never approves: status stays `pending` until an admin decides.
- If the confirmation email cannot be sent, the saved row is deleted so the customer can retry.

## Side Effects
- Supabase REST with the service role key (`listing_recommendations`, `listings`); Resend email to the customer.

## Verification
- Run: `npm run test:recommend`
