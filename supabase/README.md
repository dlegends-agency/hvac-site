# supabase

## Overview
Postgres schema and seed SQL for the HVAC directory, run by hand in the Supabase SQL Editor (no migration runner is configured in `package.json`). Every file is written to be re-runnable (`create ... if not exists`, `drop policy if exists`, `create or replace`). Run order, per the file headers: `schema.sql`, `schema-blog-analytics.sql`, `schema-contact.sql`, `schema-directory.sql`, `schema-discovery.sql`, `schema-contractors.sql`, then `schema-profiles.sql`; seeds after `schema-directory.sql`.

Subdirectories `tests/` (a single routing test) and `data/` (`zip-centroids.csv.gz`, input for `scripts/load-zip-centroids.mjs`) hold no schema code and have no contract file.

## Interface

### Files and objects (all in schema `public`)
| File | Tables | Functions / triggers |
|---|---|---|
| `schema.sql` | `leads`, `admin_users` | `is_admin()` |
| `schema-blog-analytics.sql` | `posts`, `page_views` | `touch_updated_at()`; trigger `posts_touch_updated_at` |
| `schema-contact.sql` | `contact_messages` | none |
| `schema-directory.sql` | `listings`, `listing_private`; adds `posts.cover_image` | trigger `listings_touch_updated_at` |
| `schema-discovery.sql` | `discovery_jobs`, `listing_candidates`, `discovery_rejected`, `discovery_runs`; adds `listings.source`, `source_url`, `attribution`; drops `listings.google_place_id` | none |
| `schema-contractors.sql` | `listing_owners`, `listing_claims`, `listing_billing`, `lead_assignments`, `zip_centroids`, `lead_notifications`, `notification_settings`; adds columns to `listings` (`plan`, `plan_until`, `google_rating`, `google_review_count`, `google_reviews_url`, `google_place_id`, `rating_updated_at`, `service_radius_miles`), `leads` (`assigned_listing_id`, `assigned_at`, `contractor_status`, `contractor_notes`) and `listing_owners` (`notify_email`) | see below |
| `schema-profiles.sql` | `listing_recommendations` (private; `featured`, `ip_hash` columns); views `listing_recommendations_public` (approved only), `listing_recommendation_counts`; functions `my_recommendations()`, `decide_my_recommendation(id, status)`, `feature_my_recommendation(id, on)` (the owner shows or hides a recommendation and features one if the plan is paid); adds columns to `listings` (`license_number`, `license_verified_at`, `verified_at`, `business_hours`, `avatar_path`, `cover_image_path`); creates the public Storage bucket `listing-images` (2 MB, JPEG/PNG/WebP; only the owner of an active paid listing can add files to their own `<listing id>/` folder) | `sync_listing_verified()` (trigger on `listing_owners`: ownership sets and clears `verified_at`), `protect_profile_fields()` (trigger `listings_protect_profile`: only admins and server code set the verified marks, a changed license number clears its check, hours and photos need an active paid plan, a public submission is forced to a free unverified listing) |
| `update-2026-11-05.sql` | none of its own: a one-off bundle for an existing database (the changed `protect_listing_fields()` so About us is free, then all of `schema-profiles.sql`). Run it once instead of re-running the two files | see above |
| `schema-customers.sql` | adds `leads.customer_id` | `my_requests()` (the signed-in customer's own requests, with the businesses that received them and whether each is marked contacted; never contractor notes; older requests by the same address only once the account's email is confirmed) |
| `lock-direct-inserts.sql` | none | run last, after the CAPTCHA is live: drops the public insert policies on `leads`, `contact_messages`, `listings`, `listing_private` so the forms can only write through `/api/submit/*`; signed-in contractors can still add their own pending business |
| `seed-listings.sql` | inserts 24 rows into `listings` (Austin, Dallas, Houston, San Antonio areas); existing slugs skipped | none |
| `seed-blog-posts.sql` | inserts 9 rows into `posts`; existing slugs skipped | none |

### Functions in `schema-contractors.sql`
| Function | Notes |
|---|---|
| `norm_state(s text)`, `zip5(s text)`, `miles_between(lat1, lng1, lat2, lng2)` | Helpers for state, ZIP and distance matching |
| `route_lead(p_lead uuid, p_max int default 3)` | `security definer`; inserts into `lead_assignments`; EXECUTE revoked from `public, anon, authenticated` |
| `leads_auto_route()` | Trigger function behind `leads_route_after_insert` (after insert on `leads`); EXECUTE revoked |
| `admin_route_lead(p_lead uuid)` | Raises `Admins only` for non-admins; granted to `authenticated` |
| `my_leads()` | Contractor's own assigned leads; granted to `authenticated` |
| `update_my_lead(p_id uuid, p_status text, p_notes text)` | Raises `Invalid status`, `Unlock this lead first`, `Lead not found`; granted to `authenticated` |
| `unlock_lead(p_lead uuid, p_listing uuid, p_cents int, p_ref text)` | Called by the Stripe webhook; granted only to `service_role` |
| `protect_listing_fields()` | Trigger `listings_protect_fields` (before update on `listings`) |
| `stamp_rating_time()` | Trigger `listings_stamp_rating` (before update on `listings`) |
| `queue_lead_notification()` | Trigger `lead_assignments_queue_notification` (after insert on `lead_assignments`); EXECUTE revoked |
| `claim_lead_notifications(p_limit int default 20)` | Uses `for update skip locked`; granted only to `service_role` |
| `finish_lead_notifications(p_sent uuid[], p_failed jsonb default '{}')` | Granted only to `service_role` |
| `set_my_email_alerts(p_on boolean)` | Granted to `authenticated` |

### Row-level security policies
RLS is enabled on every table above. Policies by table:

- `leads`: "Anyone can submit a lead" (insert, anon and authenticated, `status = 'new'`), "Admins can read leads", "Admins can update leads".
- `admin_users`: "Users can read own admin row".
- `posts`: "Public can read published posts", "Admins manage posts".
- `page_views`: "Anyone can record a page view", "Admins can read page views".
- `contact_messages`: "Anyone can send a contact message" (`status = 'new'`), "Admins manage contact messages".
- `listings`: "Public can read published listings", "Anyone can submit a listing" (redefined in `schema-discovery.sql` to require `status = 'pending' and source = 'submitted'`), "Admins manage listings", "Owners read own listing", "Owners update own listing".
- `listing_private`: "Anyone can add submitter details" (`admin_notes is null`), "Admins manage private details".
- `discovery_jobs`, `listing_candidates`, `discovery_rejected`: admin-only (`Admins manage discovery jobs`, `Admins manage candidates`, `Admins manage rejected`); `discovery_runs`: "Admins read run log".
- `listing_owners`: "Owners read own ownership", "Admins manage ownership".
- `listing_claims`: "Contractors file own claims", "Contractors read own claims", "Admins manage claims".
- `listing_billing`: "Owners read own billing", "Admins read billing".
- `lead_assignments`: "Admins manage lead assignments".
- `zip_centroids`, `lead_notifications`, `notification_settings`: RLS on with no policies (server and `security definer` functions only).

## Invariants
- `public.is_admin()` (`schema.sql`) is the single admin check; it must exist before any later file runs, because their policies call it. `public.touch_updated_at()` (from `schema-blog-analytics.sql`) must exist before `schema-directory.sql` creates `listings_touch_updated_at`.
- `listings.plan` is constrained to `free` or `featured` (`listings_plan_check`); `leads.contractor_status` to `new`, `contacted`, `won`, `lost`; `listings.source` to `submitted`, `seed`, `agent`, `manual`; `listings.service_radius_miles` to 5-150.
- `protect_listing_fields()` restores `id`, `slug`, `status`, `plan`, `plan_until`, `source`, `source_url`, `google_place_id`, `attribution`, `rating_updated_at` for non-admin, non-service-role updates; `services` and `service_areas` are also reverted unless the listing is `featured` with `plan_until` null or in the future.
- Public (anon) inserts cannot self-approve: leads require `status = 'new'`, contact messages `status = 'new'`, listings `status = 'pending'` and `source = 'submitted'`.
- Contractors never read `leads` directly; they get leads through `my_leads()`, which withholds customer fields until the lead is unlocked (`lead_assignments.unlocked_at`). `update_my_lead` refuses with "Unlock this lead first" otherwise.
- `route_lead` assigns up to `p_max` (default 3) contractors; `leads_auto_route()` must not block saving a lead (per the file comment).
- `unlock_lead` is idempotent ("Safe to call twice") and reachable only by `service_role`.
- Seed files skip rows whose slug already exists.

## Side Effects
- Run manually, these files create and alter tables, indexes, policies, triggers and functions in the live database; `schema-discovery.sql` drops `listing_candidates` and `discovery_rejected` (cascade) only if they still have the legacy `place_id` column, and drops `listings.google_place_id` (re-added later by `schema-contractors.sql`).
- `schema-contractors.sql` copies pre-existing hand-assigned leads into `lead_assignments`.
- Inserting a `leads` row triggers `route_lead`, which inserts `lead_assignments` rows, which queue `lead_notifications` rows and, when `notification_settings` is configured, call the notify endpoint through `pg_net` (`create extension if not exists pg_net with schema extensions`). If `pg_net` is unavailable, a scheduled fallback sends the emails per the file comment.
- Seeds insert 24 listings and 9 posts.

## Verification
- Run: `node supabase/tests/customers.test.mjs` (needs PGlite): loads every real schema file in order, then checks customer requests and that the lock-down closes the public insert doors.
- Run: `node supabase/tests/profiles.test.mjs` (needs `npm i --no-save @electric-sql/pglite`): loads `schema-contractors.sql` then `schema-profiles.sql` and checks the verified mark, license check, paid-only hours, public-submission limits the recommendation functions and the public recommendation views.
- Run: `node supabase/tests/routing.test.mjs`. It loads `schema-contractors.sql` into in-memory PGlite with stubbed Supabase auth. It needs `npm i --no-save @electric-sql/pglite` first (not in `package.json`; not installed here, so it was not run during documentation).
