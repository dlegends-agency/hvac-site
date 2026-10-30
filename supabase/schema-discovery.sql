-- Run AFTER schema-directory.sql. Supabase: SQL Editor > New query > paste > Run.
-- Adds: listing source tracking, discovery search jobs, temporary candidates found via the Google Places API.

-- 1. Listings: where did each one come from? ---------------------------------------
alter table public.listings add column if not exists source text not null default 'submitted'
  check (source in ('submitted', 'seed', 'google', 'manual'));
alter table public.listings add column if not exists google_place_id text unique;

update public.listings l set source = 'seed'
from public.listing_private p
where p.listing_id = l.id and p.admin_notes like 'Seeded from%' and l.source = 'submitted';

-- Public submissions must stay "submitted" (only admins can set other sources).
drop policy if exists "Anyone can submit a listing" on public.listings;
create policy "Anyone can submit a listing"
  on public.listings for insert to anon, authenticated
  with check (status = 'pending' and source = 'submitted' and google_place_id is null);

-- 2. Discovery search jobs (what to look for and where) ------------------------------
create table if not exists public.discovery_jobs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  label        text not null check (char_length(label) between 1 and 120),
  query        text not null default 'HVAC contractor' check (char_length(query) between 2 and 120),
  location     text not null check (char_length(location) between 2 and 120),
  max_results  int  not null default 20 check (max_results between 1 and 60),
  frequency    text not null default 'weekly' check (frequency in ('daily', 'weekly', 'manual')),
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  last_status  text,
  last_found   int
);

-- 3. Candidates: businesses found by a job, waiting for admin review ------------------
-- Google's terms limit how long Places data may be stored, so candidates are deleted after 30 days
-- (see cron-discovery.sql). Only google_place_id is kept long term, on imported listings.
create table if not exists public.listing_candidates (
  id          uuid primary key default gen_random_uuid(),
  fetched_at  timestamptz not null default now(),
  job_id      uuid references public.discovery_jobs (id) on delete set null,
  place_id    text not null unique,
  name        text not null,
  address     text,
  city        text,
  state       text,
  postal_code text,
  phone       text,
  website     text,
  maps_url    text
);
create index if not exists listing_candidates_fetched_idx on public.listing_candidates (fetched_at desc);

-- Place IDs an admin rejected, so they are not suggested again.
create table if not exists public.discovery_rejected (
  place_id    text primary key,
  rejected_at timestamptz not null default now()
);

alter table public.discovery_jobs enable row level security;
alter table public.listing_candidates enable row level security;
alter table public.discovery_rejected enable row level security;

drop policy if exists "Admins manage discovery jobs" on public.discovery_jobs;
create policy "Admins manage discovery jobs" on public.discovery_jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage candidates" on public.listing_candidates;
create policy "Admins manage candidates" on public.listing_candidates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage rejected places" on public.discovery_rejected;
create policy "Admins manage rejected places" on public.discovery_rejected for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Example job (edit or delete in the admin): uncomment to add a first search.
-- insert into public.discovery_jobs (label, query, location, max_results, frequency)
-- values ('Austin, TX', 'HVAC contractor', 'Austin, TX', 20, 'weekly');
