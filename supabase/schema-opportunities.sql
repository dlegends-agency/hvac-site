-- Run AFTER schema-contractors.sql, schema-permits.sql and schema-bids.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Sends the two scraped lead sources (HVAC building permits and SAM.gov government bids) to every contractor whose business reaches the
-- job: the job is in the contractor's city or a city they list, or its ZIP code is within the contractor's travel radius of the
-- contractor's own business ZIP code (the same rule that sends website requests to contractors).
-- A contractor sees everything about a lead EXCEPT the phone number, email address and website of the people on it (and the
-- link to the original record). Those unlock for a one-time payment per lead, per business.
-- Contractors never read public_permits or gov_bids directly: only through my_permits() and my_bids() below.

-- 1. What each business has paid to unlock ------------------------------------------------------------
create table if not exists public.opportunity_unlocks (
  listing_id  uuid not null references public.listings (id) on delete cascade,
  kind        text not null check (kind in ('permit', 'bid')),
  item_id     uuid not null,                       -- public_permits.id or gov_bids.id
  unlocked_at timestamptz not null default now(),
  unlock_cents int,
  unlock_ref  text,                                -- the Stripe checkout session
  primary key (listing_id, kind, item_id)
);
create index if not exists opportunity_unlocks_listing_idx on public.opportunity_unlocks (listing_id, unlocked_at desc);
alter table public.opportunity_unlocks enable row level security;
revoke all on public.opportunity_unlocks from anon, authenticated;
grant select on public.opportunity_unlocks to authenticated;
drop policy if exists "Admins read opportunity unlocks" on public.opportunity_unlocks;
create policy "Admins read opportunity unlocks" on public.opportunity_unlocks for select to authenticated using (public.is_admin());

-- 2. Does this business reach this place? ---------------------------------------------------------------
create or replace function public.listing_reaches(p_listing uuid, p_city text, p_state text, p_zip text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings li
    left join public.zip_centroids z on z.zip = public.zip5(li.postal_code)
    left join public.zip_centroids t on t.zip = public.zip5(p_zip)
    where li.id = p_listing and li.status = 'published'
      and (
        (public.norm_state(li.state) = public.norm_state(p_state) and (
           lower(btrim(li.city)) = lower(btrim(p_city))
           or (li.service_areas is not null and nullif(btrim(p_city), '') is not null
               and li.service_areas ~* ('\m' || regexp_replace(btrim(p_city), '([^a-zA-Z0-9 ])', '\\\1', 'g') || '\M'))
        ))
        or (z.lat is not null and t.lat is not null and public.miles_between(z.lat, z.lng, t.lat, t.lng) <= li.service_radius_miles)
      )
  );
$$;

-- 3. Permits in this contractor's area ---------------------------------------------------------------------
-- Every permit in Austin and Dallas is in Texas. The people on a permit come back without phone, email and website until unlocked.
create or replace function public.my_permits()
returns table (
  id uuid, imported_at timestamptz, source text, source_id text, city text, permit_type text, issued_on date, trade text,
  value_usd numeric, property_class text, summary text, description text, address text, zip text, contractor_name text,
  people jsonb, source_url text, unlocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.imported_at, p.source, p.source_id, p.city, p.permit_type, p.issued_on, p.trade,
         p.value_usd, p.property_class, p.summary, p.description, p.address, p.zip, p.contractor_name,
         case when u.item_id is not null then p.people
              else (select coalesce(jsonb_agg(x - 'phone' - 'email' - 'website'), '[]'::jsonb) from jsonb_array_elements(p.people) x) end,
         case when u.item_id is not null then p.source_url end,
         (u.item_id is not null)
  from public.listing_owners o
  join public.public_permits p on p.trade = 'HVAC' and public.listing_reaches(o.listing_id, p.city, 'TX', p.zip)
  left join public.opportunity_unlocks u on u.listing_id = o.listing_id and u.kind = 'permit' and u.item_id = p.id
  where o.user_id = auth.uid()
  order by p.issued_on desc nulls last
  limit 1000;
$$;

-- 4. Government bids in this contractor's area ---------------------------------------------------------------
-- The contracting contacts come back with a name and title only, and the SAM.gov links (which list the contact's details)
-- stay hidden, until unlocked.
create or replace function public.my_bids()
returns table (
  id uuid, imported_at timestamptz, notice_id text, title text, solicitation_number text, agency text, department text, office text,
  notice_type text, posted_at timestamptz, response_due timestamptz, set_aside text, set_aside_code text, naics text, psc text,
  relevance text, city text, state text, zip text, address text, contacts jsonb, description text, sam_url text, info_url text,
  summary text, unlocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.imported_at, b.notice_id, b.title, b.solicitation_number, b.agency, b.department, b.office,
         b.notice_type, b.posted_at, b.response_due, b.set_aside, b.set_aside_code, b.naics, b.psc,
         b.relevance, b.city, b.state, b.zip, b.address,
         case when u.item_id is not null then b.contacts
              else (select coalesce(jsonb_agg(x - 'phone' - 'email'), '[]'::jsonb) from jsonb_array_elements(b.contacts) x) end,
         b.description,
         case when u.item_id is not null then b.sam_url end,
         case when u.item_id is not null then b.info_url end,
         b.summary,
         (u.item_id is not null)
  from public.listing_owners o
  join public.gov_bids b on public.listing_reaches(o.listing_id, b.city, b.state, b.zip)
  left join public.opportunity_unlocks u on u.listing_id = o.listing_id and u.kind = 'bid' and u.item_id = b.id
  where o.user_id = auth.uid()
  order by b.posted_at desc nulls last
  limit 1000;
$$;

-- 5. Used by the payment server (service role only) -------------------------------------------------------------
-- Is this lead in the business's area? (so nobody can pay for, or unlock, a lead that was never sent to them)
create or replace function public.opportunity_reaches(p_kind text, p_item uuid, p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_kind = 'permit'
    then exists (select 1 from public.public_permits p where p.id = p_item and public.listing_reaches(p_listing, p.city, 'TX', p.zip))
    else exists (select 1 from public.gov_bids b where b.id = p_item and public.listing_reaches(p_listing, b.city, b.state, b.zip)) end;
$$;

-- Called once the payment succeeded. Safe to call twice.
create or replace function public.unlock_opportunity(p_kind text, p_item uuid, p_listing uuid, p_cents int, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('permit', 'bid') or not public.opportunity_reaches(p_kind, p_item, p_listing) then
    return false;
  end if;
  insert into public.opportunity_unlocks (listing_id, kind, item_id, unlock_cents, unlock_ref)
  values (p_listing, p_kind, p_item, p_cents, p_ref)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.listing_reaches(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.opportunity_reaches(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.unlock_opportunity(text, uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.opportunity_reaches(text, uuid, uuid) to service_role;
grant execute on function public.unlock_opportunity(text, uuid, uuid, int, text) to service_role;
revoke all on function public.my_permits() from public, anon;
revoke all on function public.my_bids() from public, anon;
grant execute on function public.my_permits() to authenticated;
grant execute on function public.my_bids() to authenticated;
