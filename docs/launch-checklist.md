# Soft launch checklist

## Must do before launch
1. **Supabase SQL Editor, in this order** (all safe to re-run): `schema-revamp.sql`, `schema-flow.sql`, `schema-messages.sql`, `schema-myleads.sql`, `schema-projects.sql`, `schema-bidprep.sql`, `schema-bookings.sql`, `schema-analytics.sql`, and **last** `schema-hardening.sql`. Also `schema-assistant.sql` and `schema-schedule.sql` if not yet run.
2. **CAPTCHA:** set `TURNSTILE_SECRET_KEY` in Cloudflare (Secret) and the site key in the build settings. Without the secret the request, contact and add-business forms are not protected against bots.
3. **Stripe:** `STRIPE_PRICE_FEATURED`, `_YEARLY`, `STRIPE_PRICE_PREMIUM`, `_YEARLY` (the site refuses a price that differs from the website), `STRIPE_WEBHOOK_SECRET` (starts `whsec_`), turn on plan switching in the customer portal. Confirm the Premium ($49) versus Featured ($99) pricing is intended.
4. **Email:** `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` (a verified domain), `NOTIFY_SECRET`; GitHub secrets `NOTIFY_SECRET` and `SITE_URL` so the flush workflow runs; set the endpoint and secret in `notification_settings` (README).
5. **AI:** `AI_BASE_URL` and `AI_API_KEY`, or `ANTHROPIC_API_KEY`. Put a credit limit on the key.
6. **Scrapers:** cron-job.org calling `/api/cron/scrapes` with header `X-Notify-Secret`.
7. **Domain:** if you move off `hvac-site-4i7.pages.dev`, set `VITE_SITE_URL` and change the `Sitemap:` line in `public/robots.txt`.
8. **Rotate** any key that was ever pasted into a chat or committed. Mark sensitive Cloudflare variables as Secret.
9. **Create the admin:** insert your user id into `public.admin_users` (README). Admin, contractor and customer are separate sign-ins.
10. Redeploy after changing variables, then use each area once signed in: customer (request, messages), contractor (unlock, My Leads, a booking, Bid Preparation), admin (approve a listing).

## Done in this review
- Database: every table has row security; signed-out visitors reach only public listings, posts and the visit counter; server-only functions cannot be called from a browser; trigger functions are locked; direct public inserts that skip the CAPTCHA are closed; a business cannot set its own plan, premium, verification or Google rating. Tests: `supabase/tests/security.test.mjs`, `abuse.test.mjs` (run on every push).
- Server: Stripe webhook signature and replay window, price-must-match, ownership checks on every contractor endpoint, secrets compared in constant time, no secret values in code, `npm audit` clean.
- Site: security headers and a content security policy (`public/_headers`), no raw HTML injection in the app, private areas set to noindex and disallowed in `robots.txt`.

## Known limits (not blockers)
- If `TURNSTILE_SECRET_KEY` is missing the CAPTCHA is skipped by design.
- `/api/google/rating` and `/photo` are public and spend Google quota: set a daily quota on the key.
- Two simultaneous one-click saved-card payments for the same lead could both charge before the first unlock is recorded. The buttons disable while a payment runs, so this needs a deliberate double request; add a Stripe idempotency key per lead after launch.
- A recommendation confirmation link can be used up by an email scanner that opens links.
- Nothing has been checked with real payments or real email from a browser: do one test purchase and one test email.
