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

-- 6. Email alerts for new permits and bids ---------------------------------------------------------------------
-- A daily summary email (sent by the "Opportunity alerts" workflow after the scrapes) tells each contractor how many NEW permits and
-- government bids reached their business since their last summary, with up to three titles. It never contains a phone number or an
-- email address, only a link to the dashboard. The same on/off switch as the new-request emails controls it (listing_owners.notify_email).
-- Nothing is sent when nothing new reached them.
create table if not exists public.opportunity_digests (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  since      timestamptz not null,                    -- only leads imported after this time are counted
  permits    int not null default 0,
  bids       int not null default 0,
  highlights jsonb not null default '[]'::jsonb,      -- up to three newest: { kind, title, city }
  claimed_at timestamptz,
  sent_at    timestamptz,
  attempts   int not null default 0,
  last_error text
);
create index if not exists opportunity_digests_listing_idx on public.opportunity_digests (listing_id, created_at desc);
create index if not exists opportunity_digests_pending_idx on public.opportunity_digests (created_at) where sent_at is null;
alter table public.opportunity_digests enable row level security; -- no policies: only the functions below touch it

-- Works out who has something new and queues one summary each. Returns how many were queued. Service role only.
create or replace function public.queue_opportunity_digests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_since timestamptz;
  v_permits int;
  v_bids int;
  v_high jsonb;
  n int := 0;
begin
  for r in
    select o.listing_id
    from public.listing_owners o
    join public.listings li on li.id = o.listing_id
    where o.notify_email and li.status = 'published'
  loop
    -- A first summary looks back a week; after that it counts from the previous summary.
    select coalesce(max(d.created_at), now() - interval '7 days') into v_since from public.opportunity_digests d where d.listing_id = r.listing_id;

    select count(*)::int into v_permits from public.public_permits p
     where p.trade = 'HVAC' and p.imported_at > v_since and public.listing_reaches(r.listing_id, p.city, 'TX', p.zip);
    select count(*)::int into v_bids from public.gov_bids b
     where b.imported_at > v_since and public.listing_reaches(r.listing_id, b.city, b.state, b.zip);
    continue when v_permits + v_bids = 0;

    select coalesce(jsonb_agg(x.h order by x.t desc), '[]'::jsonb) into v_high from (
      select * from (
        select jsonb_build_object('kind', 'bid', 'title', b.title, 'city', b.city) as h, b.imported_at as t
          from public.gov_bids b where b.imported_at > v_since and public.listing_reaches(r.listing_id, b.city, b.state, b.zip)
        union all
        select jsonb_build_object('kind', 'permit', 'title', p.summary, 'city', p.city), p.imported_at
          from public.public_permits p where p.trade = 'HVAC' and p.imported_at > v_since and public.listing_reaches(r.listing_id, p.city, 'TX', p.zip)
      ) y order by t desc limit 3
    ) x;

    insert into public.opportunity_digests (listing_id, since, permits, bids, highlights) values (r.listing_id, v_since, v_permits, v_bids, v_high);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- The sender claims a batch (safe if two senders run at once) and gets what it needs to write each email.
create or replace function public.claim_opportunity_digests(p_limit int default 20)
returns table (id uuid, email text, business_name text, permits int, bids int, highlights jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Contractors who switched alerts off are marked done without sending.
  update public.opportunity_digests d
     set sent_at = now(), last_error = 'alerts switched off'
    from public.listing_owners o
   where o.listing_id = d.listing_id and not o.notify_email and d.sent_at is null;

  return query
  with picked as (
    select d.id from public.opportunity_digests d
     where d.sent_at is null and d.attempts < 5 and (d.claimed_at is null or d.claimed_at < now() - interval '5 minutes')
     order by d.created_at
     limit greatest(p_limit, 0)
     for update skip locked
  ), marked as (
    update public.opportunity_digests d set attempts = d.attempts + 1, claimed_at = now()
      from picked where d.id = picked.id
    returning d.id, d.listing_id, d.permits, d.bids, d.highlights
  )
  select m.id, u.email::text, li.business_name, m.permits, m.bids, m.highlights
    from marked m
    join public.listings li on li.id = m.listing_id
    join public.listing_owners o on o.listing_id = m.listing_id
    join auth.users u on u.id = o.user_id;
end;
$$;

create or replace function public.finish_opportunity_digests(p_sent uuid[], p_failed jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.opportunity_digests set sent_at = now(), last_error = null where id = any (coalesce(p_sent, '{}'));
  update public.opportunity_digests d set last_error = left(f.value, 300), claimed_at = null
    from jsonb_each_text(coalesce(p_failed, '{}'::jsonb)) f
   where d.id::text = f.key and d.sent_at is null;
end;
$$;

revoke all on function public.queue_opportunity_digests() from public, anon, authenticated;
revoke all on function public.claim_opportunity_digests(int) from public, anon, authenticated;
revoke all on function public.finish_opportunity_digests(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.queue_opportunity_digests() to service_role;
grant execute on function public.claim_opportunity_digests(int) to service_role;
grant execute on function public.finish_opportunity_digests(uuid[], jsonb) to service_role;

-- 7. Emailing the contact on a permit or a bid, from the site ---------------------------------------------------
-- After a business has paid to unlock a permit or bid, it can email the contractor on the permit or the contracting officer on the bid
-- through the site (/api/opportunities/email). Rules, enforced by the server with these functions:
--   * only an UNLOCKED lead, and only an address that is on that lead (the browser sends which contact, never an address);
--   * at most 2 emails to the same address from one business per day, and 20 per business per day;
--   * never to an address on the opt-out list (email_optouts): add an address there to stop all emails to it.
-- Each email goes out From "<Business> via HVACHelp" with Reply-To set to the business, so the answer goes straight to them.
create table if not exists public.opportunity_emails (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind       text not null check (kind in ('permit', 'bid')),
  item_id    uuid not null,
  to_email   text not null,
  subject    text not null,
  body       text not null,
  error      text                                  -- set when the email could not be sent
);
create index if not exists opportunity_emails_listing_idx on public.opportunity_emails (listing_id, created_at desc);
create index if not exists opportunity_emails_to_idx on public.opportunity_emails (lower(to_email), created_at desc);
alter table public.opportunity_emails enable row level security;
revoke all on public.opportunity_emails from anon, authenticated;
grant select on public.opportunity_emails to authenticated;
drop policy if exists "Admins read opportunity emails" on public.opportunity_emails;
create policy "Admins read opportunity emails" on public.opportunity_emails for select to authenticated using (public.is_admin());

-- Addresses that must never be emailed through the site. Add one by hand: insert into public.email_optouts (email) values ('someone@example.com');
create table if not exists public.email_optouts (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.email_optouts enable row level security;
revoke all on public.email_optouts from anon, authenticated;
grant select on public.email_optouts to authenticated;
drop policy if exists "Admins read email optouts" on public.email_optouts;
create policy "Admins read email optouts" on public.email_optouts for select to authenticated using (public.is_admin());

-- What the server needs to email one contact: the address (read here, never taken from the browser) and the limits. Service role only.
create or replace function public.opportunity_email_target(p_kind text, p_item uuid, p_listing uuid, p_index int)
returns table (unlocked boolean, to_email text, to_name text, optout boolean, sent_to_today int, sent_total_today int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
begin
  if p_kind = 'permit' then
    select nullif(btrim(x ->> 'email'), ''), coalesce(nullif(btrim(x ->> 'name'), ''), nullif(btrim(x ->> 'company'), ''))
      into v_email, v_name
      from public.public_permits p, lateral (select p.people -> p_index as x) j where p.id = p_item;
  elsif p_kind = 'bid' then
    select nullif(btrim(x ->> 'email'), ''), nullif(btrim(x ->> 'name'), '')
      into v_email, v_name
      from public.gov_bids b, lateral (select b.contacts -> p_index as x) j where b.id = p_item;
  end if;
  v_email := lower(v_email);
  return query select
    exists (select 1 from public.opportunity_unlocks u where u.listing_id = p_listing and u.kind = p_kind and u.item_id = p_item),
    v_email, v_name,
    exists (select 1 from public.email_optouts o where o.email = v_email),
    (select count(*)::int from public.opportunity_emails e where e.listing_id = p_listing and lower(e.to_email) = v_email and e.created_at > now() - interval '1 day' and e.error is null),
    (select count(*)::int from public.opportunity_emails e where e.listing_id = p_listing and e.created_at > now() - interval '1 day' and e.error is null);
end;
$$;

create or replace function public.log_opportunity_email(p_listing uuid, p_kind text, p_item uuid, p_to text, p_subject text, p_body text, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.opportunity_emails (listing_id, kind, item_id, to_email, subject, body, error)
  values (p_listing, p_kind, p_item, lower(p_to), left(p_subject, 200), left(p_body, 4000), left(p_error, 300))
$$;

revoke all on function public.opportunity_email_target(text, uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.log_opportunity_email(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.opportunity_email_target(text, uuid, uuid, int) to service_role;
grant execute on function public.log_opportunity_email(uuid, text, uuid, text, text, text, text) to service_role;
