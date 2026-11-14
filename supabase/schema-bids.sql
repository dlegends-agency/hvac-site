-- Run AFTER schema-permits.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Two separate lead sources, each in its own table:
--   public_permits  building permits from city open-data portals (schema-permits.sql)
--   gov_bids        open federal contract notices from SAM.gov for HVAC work in Texas (this file)
-- Admins read both. A signed-in business owner (a user who manages a listing) reads both too, so the opportunities show up in the
-- contractor dashboard. Only the importers (scripts/permits, scripts/bids, using the service role key) write to them.

create table if not exists public.gov_bids (
  id                  uuid primary key default gen_random_uuid(),
  imported_at         timestamptz not null default now(),
  notice_id           text not null unique,                 -- SAM.gov's own id
  title               text not null,
  solicitation_number text,
  agency              text,
  department          text,
  office              text,
  notice_type         text not null,                        -- Solicitation, Presolicitation, Sources Sought, Special Notice ...
  posted_at           timestamptz,
  response_due        timestamptz,                          -- null when none is given
  set_aside           text,                                 -- for example "Total Small Business Set-Aside"; null when open to all
  set_aside_code      text,
  naics               text,
  psc                 text,
  relevance           text,                                 -- why it counts as HVAC work
  city                text,
  state               text,
  zip                 text,
  address             text,
  contacts            jsonb not null default '[]'::jsonb,   -- the contracting contacts the notice lists: name, email, phone
  description         text,
  sam_url             text,
  info_url            text,
  summary             text not null
);
create index if not exists gov_bids_posted_idx on public.gov_bids (posted_at desc nulls last);
create index if not exists gov_bids_due_idx on public.gov_bids (response_due);
create index if not exists gov_bids_city_idx on public.gov_bids (city);

-- Who is a business owner: a signed-in user who manages a listing.
create or replace function public.is_business_owner()
returns boolean language sql security definer set search_path = public stable
as $$ select auth.uid() is not null and exists (select 1 from public.listing_owners o where o.user_id = auth.uid()) $$;
revoke all on function public.is_business_owner() from public, anon;
grant execute on function public.is_business_owner() to authenticated;

alter table public.gov_bids enable row level security;
revoke all on public.gov_bids from anon, authenticated;
grant select on public.gov_bids to authenticated;
drop policy if exists "Admins read bids" on public.gov_bids;
create policy "Admins read bids" on public.gov_bids for select to authenticated using (public.is_admin());
drop policy if exists "Business owners read bids" on public.gov_bids;
create policy "Business owners read bids" on public.gov_bids for select to authenticated using (public.is_business_owner());

-- Business owners also read the permits (public records), so both lead sources reach them.
do $$
begin
  if to_regclass('public.public_permits') is not null then
    drop policy if exists "Business owners read permits" on public.public_permits;
    create policy "Business owners read permits" on public.public_permits for select to authenticated using (public.is_business_owner());
  end if;
end $$;
