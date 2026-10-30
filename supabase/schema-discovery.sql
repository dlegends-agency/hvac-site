-- Run AFTER schema-directory.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Adds what the free discovery agent needs (see scripts/discovery-agent/README.md): listing source tracking,
-- search jobs, candidates waiting for review, rejected businesses and a run log.
--
-- If you ran an EARLIER version of this file (the Google Places design), this migrates it. It drops the old
-- Google-specific column and tables, which only ever held discovery data.

-- 1. Listings: where did each one come from? ---------------------------------------
alter table public.listings drop column if exists google_place_id;
alter table public.listings add column if not exists source text not null default 'submitted';
alter table public.listings drop constraint if exists listings_source_check;
update public.listings set source = 'agent' where source = 'google';
alter table public.listings add constraint listings_source_check check (source in ('submitted', 'seed', 'agent', 'manual'));
alter table public.listings add column if not exists source_url text;
alter table public.listings add column if not exists attribution text;

update public.listings l set source = 'seed'
from public.listing_private p
where p.listing_id = l.id and p.admin_notes like 'Seeded from%' and l.source = 'submitted';

-- Public submissions must stay "submitted" (only admins can set other sources).
drop policy if exists "Anyone can submit a listing" on public.listings;
create policy "Anyone can submit a listing"
  on public.listings for insert to anon, authenticated
  with check (status = 'pending' and source = 'submitted');

-- 2. Discovery search jobs (what to look for and where) ------------------------------
-- Remove the tables only if they are the old Google-era versions (they have a place_id column).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'listing_candidates' and column_name = 'place_id') then
    drop table public.listing_candidates cascade;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'discovery_rejected' and column_name = 'place_id') then
    drop table public.discovery_rejected cascade;
  end if;
end $$;

create table if not exists public.discovery_jobs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  label         text not null check (char_length(label) between 1 and 120),
  query         text not null default 'HVAC contractor' check (char_length(query) between 2 and 120),
  location      text not null check (char_length(location) between 2 and 120),
  max_results   int  not null default 20 check (max_results between 1 and 60),
  frequency     text not null default 'weekly' check (frequency in ('daily', 'weekly', 'manual')),
  enabled       boolean not null default true,
  -- "Run now" in the admin sets this; the agent clears it after running.
  run_requested boolean not null default false,
  last_run_at   timestamptz,
  last_status   text,
  last_found    int
);
alter table public.discovery_jobs add column if not exists run_requested boolean not null default false;

-- 3. Candidates: businesses the agent found, waiting for admin review -----------------
create table if not exists public.listing_candidates (
  id           uuid primary key default gen_random_uuid(),
  fetched_at   timestamptz not null default now(),
  job_id       uuid references public.discovery_jobs (id) on delete set null,
  external_id  text not null unique,           -- "web:example.com" or "osm:node/123"
  origin       text not null default 'web' check (origin in ('web', 'osm')),
  name         text not null,
  address      text,
  city         text,
  state        text,
  postal_code  text,
  phone        text,
  website      text,
  source_url   text,                            -- page the details were read from
  services     text[] not null default '{}',
  emergency    boolean not null default false,
  verified     boolean not null default false,  -- details confirmed on the business's own website
  confidence   int not null default 0 check (confidence between 0 and 100),
  notes        text
);
create index if not exists listing_candidates_fetched_idx on public.listing_candidates (fetched_at desc);

-- Businesses an admin rejected, so they are not suggested again.
create table if not exists public.discovery_rejected (
  external_id text primary key,
  rejected_at timestamptz not null default now()
);

-- 4. Agent run log (what it searched, visited and decided) ------------------------------
create table if not exists public.discovery_runs (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references public.discovery_jobs (id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text,
  found       int not null default 0,
  log         text[] not null default '{}'
);
create index if not exists discovery_runs_started_idx on public.discovery_runs (started_at desc);

-- 5. Row level security: admins only (the agent uses the service role key and bypasses RLS) -----
alter table public.discovery_jobs enable row level security;
alter table public.listing_candidates enable row level security;
alter table public.discovery_rejected enable row level security;
alter table public.discovery_runs enable row level security;

drop policy if exists "Admins manage discovery jobs" on public.discovery_jobs;
create policy "Admins manage discovery jobs" on public.discovery_jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage candidates" on public.listing_candidates;
create policy "Admins manage candidates" on public.listing_candidates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage rejected" on public.discovery_rejected;
create policy "Admins manage rejected" on public.discovery_rejected for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read run log" on public.discovery_runs;
create policy "Admins read run log" on public.discovery_runs for select to authenticated
  using (public.is_admin());
