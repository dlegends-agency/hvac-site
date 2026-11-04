# functions/api/submit

## Overview
The public forms (service request, contact message, list your business). Each endpoint checks the Cloudflare Turnstile CAPTCHA, keeps only the fields its form may set, and saves with the service role key. This lets `supabase/lock-direct-inserts.sql` close the direct database inserts that a bot could use to skip the CAPTCHA.

## Interface
- `lead.ts`: `onRequestPost` for `POST /api/submit/lead`; also exports `LEAD_FIELDS`. Links the lead to the signed-in customer (`Authorization` header) through `customer_id`.
- `contact.ts`: `onRequestPost` for `POST /api/submit/contact` (`contact_messages`).
- `listing.ts`: `onRequestPost` for `POST /api/submit/listing` (a pending, free `listings` row plus `listing_private`).

## Invariants
- 501 when `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_URL` is missing. 400 with `{ captcha: true }` when the security check fails. When `TURNSTILE_SECRET_KEY` is not set the check is skipped.
- A visitor cannot set `status`, assignment, `customer_id`, `plan` or any other field outside the whitelist. A listing is always saved as `pending`, `free`, source `submitted`.
- A repeated lead idempotency key (409) is treated as success. If `customer_id` does not exist yet (customer SQL not run), the lead is saved without it.

## Side Effects
- Cloudflare Turnstile `siteverify`; Supabase REST (service role) writes to `leads`, `contact_messages`, `listings`, `listing_private`; Supabase Auth `GET /auth/v1/user` to identify a signed-in customer.

## Verification
- Run: `npm run test:submit`
