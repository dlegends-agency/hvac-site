-- Government vendor discovery. Run AFTER schema-directory.sql, schema-discovery.sql, schema-contractors.sql, schema-permits.sql and
-- schema-bids.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run. Nothing here changes how permits, bids, leads,
-- subscriptions or claims work; it only adds tables and two optional listing columns.
--
-- Flow: official vendor files (Texas Comptroller CMBL, SBA / SAM.gov certified businesses) -> gov_vendors -> matched against open
-- bids and recent permits through naics_nigp_map -> imported as UNCLAIMED, pending listings. No login, no subscription, no lead
-- routing is created for them: a business must claim the listing (listing_claims) and an admin must approve it.

-- 1. Listings imported from vendor files ----------------------------------------------------------------
alter table public.listings drop constraint if exists listings_source_check;
alter table public.listings add constraint listings_source_check check (source in ('submitted', 'seed', 'agent', 'manual', 'vendor'));
-- True until an owner's claim is approved. Shown on the public page as "Unclaimed listing".
alter table public.listings add column if not exists unclaimed boolean not null default false;
alter table public.listings add column if not exists vendor_synced_at timestamptz;

-- When an admin approves a claim (a listing_owners row appears) the listing stops being unclaimed.
create or replace function public.listing_claimed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.listings set unclaimed = false where id = new.listing_id and unclaimed;
  return new;
end $$;
drop trigger if exists listing_owners_claimed on public.listing_owners;
create trigger listing_owners_claimed after insert on public.listing_owners for each row execute function public.listing_claimed();

-- 2. NAICS -> NIGP mapping (editable by admins) ----------------------------------------------------------
-- NIGP is the commodity code system Texas uses (class = 3 digits, item = 2 digits, written 910-36). NAICS is the federal industry code.
create table if not exists public.naics_nigp_map (
  id         bigint generated always as identity primary key,
  naics      text not null check (naics ~ '^[0-9]{2,6}$'),
  nigp_class text not null check (nigp_class ~ '^[0-9]{3}$'),
  nigp_item  text check (nigp_item is null or nigp_item ~ '^[0-9]{2}$'),     -- null = the whole class
  weight     int  not null default 50 check (weight between 1 and 100),       -- how strongly this code says "does this work"
  note       text
);
create unique index if not exists naics_nigp_map_unique on public.naics_nigp_map (naics, nigp_class, coalesce(nigp_item, ''));
alter table public.naics_nigp_map enable row level security;
revoke all on public.naics_nigp_map from anon, authenticated;
grant select, insert, update, delete on public.naics_nigp_map to authenticated;
drop policy if exists "Admins manage naics nigp map" on public.naics_nigp_map;
create policy "Admins manage naics nigp map" on public.naics_nigp_map for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.naics_nigp_map (naics, nigp_class, nigp_item, weight, note) values
  ('238220', '910', '36', 100, 'Heating, air conditioning and ventilation maintenance, repair and installation services'),
  ('238220', '910', '04', 60,  'Air duct cleaning services'),
  ('238220', '910', '17', 60,  'HVAC / energy computerized control systems'),
  ('238220', '936', '67', 70,  'Refrigeration equipment maintenance and repair'),
  ('238220', '910', '60', 25,  'Plumbing maintenance and repair (same trade code, weaker signal)'),
  ('238220', '031', '03', 35,  'Commercial and industrial air conditioner systems'),
  ('238220', '031', '06', 35,  'Central air conditioning and heating systems'),
  ('238220', '031', '51', 30,  'Central heating furnaces'),
  ('238220', '912', null, 15,  'General construction services (weak signal on its own)'),
  ('238220', '914', null, 15,  'Trades construction services (weak signal on its own)'),
  ('333415', '031', null, 40,  'Air conditioning and warm air heating equipment'),
  ('811310', '936', '67', 50,  'Commercial equipment repair: refrigeration')
on conflict do nothing;

-- 3. Vendors from official files -------------------------------------------------------------------------
create table if not exists public.gov_vendors (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('cmbl', 'sba', 'sam')),
  source_id       text not null,                                   -- CMBL vendor id (VID) or the federal UEI
  name            text not null,
  address         text,
  city            text,
  state           text,
  postal_code     text,
  county          text,
  phone           text,
  email           text,
  website         text,
  contact_name    text,
  description     text,
  naics           text[] not null default '{}',
  nigp_classes    text[] not null default '{}',                    -- ["910", "031"]
  nigp_items      text[] not null default '{}',                    -- ["910-36", "936-67"]
  classifications text[] not null default '{}',                    -- HUB, Small business, Service-disabled veteran, Woman-owned ...
  certifications  jsonb not null default '[]'::jsonb,              -- [{ "type": "8(a)", "from": "...", "to": "..." }]
  registration    jsonb not null default '{}'::jsonb,              -- vendor number, HUB expiry, registration status
  hvac_score      int not null default 0 check (hvac_score between 0 and 100),
  status          text not null default 'new' check (status in ('new', 'matched', 'imported', 'merged', 'rejected')),
  listing_id      uuid references public.listings (id) on delete set null,
  content_hash    text,                                            -- changes when the vendor's details change
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),              -- last time a sync saw this vendor in the source
  last_changed_at timestamptz not null default now(),
  source_updated_on date,                                          -- the source's own "updated" date, when it gives one
  active          boolean not null default true,                   -- false when it dropped out of the source file
  admin_notes     text,
  verified_at     timestamptz,                                     -- an admin checked these details
  unique (source, source_id)
);
create index if not exists gov_vendors_status_idx on public.gov_vendors (status, state, city);
create index if not exists gov_vendors_listing_idx on public.gov_vendors (listing_id);
create index if not exists gov_vendors_phone_idx on public.gov_vendors (phone);

-- 4. Which vendors fit which opportunity ------------------------------------------------------------------
create table if not exists public.vendor_matches (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vendor_id  uuid not null references public.gov_vendors (id) on delete cascade,
  bid_id     uuid references public.gov_bids (id) on delete cascade,
  permit_id  uuid references public.public_permits (id) on delete cascade,
  score      int not null check (score between 0 and 100),
  reasons    text[] not null default '{}',
  check ((bid_id is not null) <> (permit_id is not null)),
  unique (vendor_id, bid_id),
  unique (vendor_id, permit_id)
);
create index if not exists vendor_matches_created_idx on public.vendor_matches (created_at desc);

-- 5. Sync activity log ---------------------------------------------------------------------------------------
create table if not exists public.vendor_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  source      text not null,                                       -- cmbl, sba, sam, match, import
  status      text,
  fetched     int not null default 0,
  inserted    int not null default 0,
  updated     int not null default 0,
  matched     int not null default 0,
  imported    int not null default 0,
  duplicates  int not null default 0,
  log         text[] not null default '{}'
);
create index if not exists vendor_sync_runs_started_idx on public.vendor_sync_runs (started_at desc);

-- 6. Row level security: admins read and review; only the sync (service role key) writes vendors, matches and runs ----------
alter table public.gov_vendors enable row level security;
alter table public.vendor_matches enable row level security;
alter table public.vendor_sync_runs enable row level security;
revoke all on public.gov_vendors, public.vendor_matches, public.vendor_sync_runs from anon, authenticated;
grant select on public.gov_vendors, public.vendor_matches, public.vendor_sync_runs to authenticated;
grant update (status, admin_notes, verified_at) on public.gov_vendors to authenticated;
drop policy if exists "Admins read vendors" on public.gov_vendors;
create policy "Admins read vendors" on public.gov_vendors for select to authenticated using (public.is_admin());
drop policy if exists "Admins review vendors" on public.gov_vendors;
create policy "Admins review vendors" on public.gov_vendors for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins read vendor matches" on public.vendor_matches;
create policy "Admins read vendor matches" on public.vendor_matches for select to authenticated using (public.is_admin());
drop policy if exists "Admins read vendor runs" on public.vendor_sync_runs;
create policy "Admins read vendor runs" on public.vendor_sync_runs for select to authenticated using (public.is_admin());
