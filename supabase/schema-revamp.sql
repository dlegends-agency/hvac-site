-- Run AFTER schema-contractors.sql, schema-opportunities.sql, schema-bids.sql, schema-permits.sql and schema-assistant.sql.
-- Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- The three plans (Free, Featured, Premium) and one shared "Leads" experience:
--   Free      sees a customer's first name only. Permits and bids show a short teaser. Unlock: customer $10, permit $10, bid $100.
--   Featured  sees a customer's full name. Same teasers. Unlock: customer $5, permit $5, bid $50.
--   Premium   everything is unlocked, with every Featured benefit on the directory.
-- Premium is stored as plan = 'featured' plus listings.premium = true, so every existing "paid" check keeps working unchanged.
-- Also adds lead_pipeline: the contractor's own list (saved leads, projects and bids with a status).

-- 1. Premium -------------------------------------------------------------------------------------------
alter table public.listings add column if not exists premium boolean not null default false;

-- Only admins, the SQL editor and server code (service role) may change premium; an owner's edit never touches it.
create or replace function public.protect_premium()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.premium := false;
  else
    new.premium := old.premium;
  end if;
  return new;
end;
$$;
drop trigger if exists listings_protect_premium on public.listings;
create trigger listings_protect_premium before insert or update on public.listings for each row execute function public.protect_premium();

-- Premium and paid, right now (a lapsed plan counts as free).
create or replace function public.is_premium(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listings l where l.id = p_listing and l.plan = 'featured' and l.premium and (l.plan_until is null or l.plan_until > now()));
$$;
create or replace function public.is_paid_listing(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listings l where l.id = p_listing and l.plan = 'featured' and (l.plan_until is null or l.plan_until > now()));
$$;
revoke all on function public.is_premium(uuid) from public, anon, authenticated;
revoke all on function public.is_paid_listing(uuid) from public, anon, authenticated;

-- 2. Customer requests: what each plan sees ----------------------------------------------------------------
-- Free: first name only. Featured: full name. The phone, email, street address and the customer's own words stay locked until the lead is
-- unlocked (a payment), except on Premium, where everything is open.
drop function if exists public.my_leads();
create or replace function public.my_leads()
returns table (
  id uuid, created_at timestamptz, assigned_at timestamptz, source text, recipient_count int, unlocked boolean,
  issue text, first_name text, last_name text,
  urgency text, city text, state text, postal_code text, street text, unit text,
  phone text, email text, contact_method text, description text,
  property_type text, property_status text, preferred_contact_time text,
  contractor_status text, contractor_notes text, contacted_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.created_at, a.assigned_at, a.source,
         (select count(*)::int from public.lead_assignments x where x.lead_id = l.id),
         (a.unlocked_at is not null or public.is_premium(a.listing_id)),
         l.issue, l.first_name,
         case when public.is_paid_listing(a.listing_id) then l.last_name end,
         l.urgency, l.city,
         l.state, l.postal_code,
         case when a.unlocked_at is not null or public.is_premium(a.listing_id) then l.street end,
         case when a.unlocked_at is not null or public.is_premium(a.listing_id) then l.unit end,
         case when a.unlocked_at is not null or public.is_premium(a.listing_id) then l.phone end,
         case when a.unlocked_at is not null or public.is_premium(a.listing_id) then l.email end,
         l.contact_method,
         case when a.unlocked_at is not null or public.is_premium(a.listing_id) then l.description end,
         l.property_type, l.property_status,
         l.preferred_contact_time,
         a.contractor_status, a.contractor_notes, a.contacted_at
  from public.lead_assignments a
  join public.leads l on l.id = a.lead_id
  join public.listing_owners o on o.listing_id = a.listing_id
  where o.user_id = auth.uid() and l.status <> 'spam'
  order by a.assigned_at desc;
$$;
revoke all on function public.my_leads() from public, anon;
grant execute on function public.my_leads() to authenticated;

-- Premium may keep notes and a status on any lead without paying per request.
create or replace function public.update_my_lead(p_id uuid, p_status text, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('new', 'contacted', 'won', 'lost') then
    raise exception 'Invalid status';
  end if;
  update public.lead_assignments a
     set contractor_status = p_status,
         contractor_notes = nullif(left(p_notes, 2000), ''),
         contacted_at = case when p_status = 'new' then null when a.contacted_at is null then now() else a.contacted_at end
   where a.lead_id = p_id
     and (a.unlocked_at is not null or public.is_premium(a.listing_id))
     and exists (select 1 from public.listing_owners o where o.listing_id = a.listing_id and o.user_id = auth.uid());
  if not found then
    if exists (select 1 from public.lead_assignments a join public.listing_owners o on o.listing_id = a.listing_id
                where a.lead_id = p_id and o.user_id = auth.uid()) then
      raise exception 'Unlock this lead first';
    end if;
    raise exception 'Lead not found';
  end if;
end;
$$;
revoke all on function public.update_my_lead(uuid, text, text) from public, anon;
grant execute on function public.update_my_lead(uuid, text, text) to authenticated;

-- 3. Building permits: a teaser until unlocked ------------------------------------------------------------------
-- Locked: the type of job, city, ZIP, date, value, residential or commercial and the one-line summary. Unlocked (paid, or Premium):
-- also the street address, the work description, the contractor and their phone, email and website, and the city's record link.
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
         p.value_usd, p.property_class, p.summary,
         case when u.item_id is not null or pm.yes then p.description end,
         case when u.item_id is not null or pm.yes then p.address end,
         p.zip,
         case when u.item_id is not null or pm.yes then p.contractor_name end,
         case when u.item_id is not null or pm.yes then p.people
              else (select coalesce(jsonb_agg(jsonb_build_object('role', x -> 'role')), '[]'::jsonb) from jsonb_array_elements(p.people) x) end,
         case when u.item_id is not null or pm.yes then p.source_url end,
         (u.item_id is not null or pm.yes)
  from public.listing_owners o
  cross join lateral (select public.is_premium(o.listing_id) as yes) pm
  join public.public_permits p on p.trade = 'HVAC' and public.listing_reaches(o.listing_id, p.city, 'TX', p.zip)
  left join public.opportunity_unlocks u on u.listing_id = o.listing_id and u.kind = 'permit' and u.item_id = p.id
  where o.user_id = auth.uid()
  order by p.issued_on desc nulls last
  limit 1000;
$$;

-- 4. Government bids and procurement: a teaser until unlocked -----------------------------------------------------
-- Locked: the title, agency, notice type, dates, set-aside, codes, place and summary. Unlocked (paid, or Premium): also the solicitation number,
-- the description, the street address, the contracting officers with their phone and email, and the SAM.gov links.
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
  select b.id, b.imported_at, b.notice_id, b.title,
         case when u.item_id is not null or pm.yes then b.solicitation_number end,
         b.agency, b.department, b.office,
         b.notice_type, b.posted_at, b.response_due, b.set_aside, b.set_aside_code, b.naics, b.psc,
         b.relevance, b.city, b.state, b.zip,
         case when u.item_id is not null or pm.yes then b.address end,
         case when u.item_id is not null or pm.yes then b.contacts
              else (select coalesce(jsonb_agg(jsonb_build_object('title', x -> 'title')), '[]'::jsonb) from jsonb_array_elements(b.contacts) x) end,
         case when u.item_id is not null or pm.yes then b.description end,
         case when u.item_id is not null or pm.yes then b.sam_url end,
         case when u.item_id is not null or pm.yes then b.info_url end,
         b.summary,
         (u.item_id is not null or pm.yes)
  from public.listing_owners o
  cross join lateral (select public.is_premium(o.listing_id) as yes) pm
  join public.gov_bids b on public.listing_reaches(o.listing_id, b.city, b.state, b.zip)
  left join public.opportunity_unlocks u on u.listing_id = o.listing_id and u.kind = 'bid' and u.item_id = b.id
  where o.user_id = auth.uid()
  order by b.posted_at desc nulls last
  limit 1000;
$$;
revoke all on function public.my_permits() from public, anon;
revoke all on function public.my_bids() from public, anon;
grant execute on function public.my_permits() to authenticated;
grant execute on function public.my_bids() to authenticated;

-- 5. My Leads: saved leads, projects and bids, each with a status -----------------------------------------------------
-- A contractor saves any customer request, building permit or government bid here while deciding, then moves it along:
--   saved -> contacted -> quoted -> (bids: submitted) -> won or lost.
-- `title` and `place` are copied when saved so the list reads without loading the lead again. Only the owner of the business reads or
-- changes its rows.
create table if not exists public.lead_pipeline (
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind       text not null check (kind in ('lead', 'permit', 'bid')),
  item_id    uuid not null,
  stage      text not null default 'saved' check (stage in ('saved', 'contacted', 'quoted', 'submitted', 'won', 'lost')),
  title      text not null check (char_length(title) <= 300),
  place      text check (char_length(place) <= 200),
  note       text check (char_length(note) <= 2000),
  amount_usd numeric(12, 2) check (amount_usd >= 0),
  due_on     date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, kind, item_id)
);
create index if not exists lead_pipeline_listing_idx on public.lead_pipeline (listing_id, updated_at desc);
alter table public.lead_pipeline enable row level security;
revoke all on public.lead_pipeline from anon, authenticated;
grant select, insert, update, delete on public.lead_pipeline to authenticated;
drop policy if exists "Owners manage own pipeline" on public.lead_pipeline;
create policy "Owners manage own pipeline" on public.lead_pipeline for all to authenticated
  using (exists (select 1 from public.listing_owners o where o.listing_id = lead_pipeline.listing_id and o.user_id = auth.uid()))
  with check (exists (select 1 from public.listing_owners o where o.listing_id = lead_pipeline.listing_id and o.user_id = auth.uid()));
drop policy if exists "Admins read pipeline" on public.lead_pipeline;
create policy "Admins read pipeline" on public.lead_pipeline for select to authenticated using (public.is_admin());
