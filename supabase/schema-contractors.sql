-- Run AFTER schema-directory.sql and schema-discovery.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Adds the contractor accounts feature: paid plans (featured placement), a contractor dashboard (own profile + assigned leads),
-- listing ownership with admin-approved claims, and self-reported Google ratings.

-- 1. Listing fields: plan, ratings ----------------------------------------------------
alter table public.listings add column if not exists plan text not null default 'free';
alter table public.listings drop constraint if exists listings_plan_check;
alter table public.listings add constraint listings_plan_check check (plan in ('free', 'featured', 'premium'));
-- When a paid plan stops being active. Featured status is only shown while this is empty or in the future.
alter table public.listings add column if not exists plan_until timestamptz;

-- Rating the business reports from its own Google Business Profile (shown with a "reported by the business" label).
alter table public.listings add column if not exists google_rating numeric(2, 1) check (google_rating between 1 and 5);
alter table public.listings add column if not exists google_review_count int check (google_review_count between 0 and 1000000);
alter table public.listings add column if not exists google_reviews_url text check (char_length(google_reviews_url) <= 500);
alter table public.listings add column if not exists rating_updated_at timestamptz;

-- Google's place ID (the only Google data we may store). It is set only by the server after the owner picks their business
-- from Google's search results, and the live star rating is fetched with it when a listing page is viewed.
alter table public.listings add column if not exists google_place_id text check (char_length(google_place_id) <= 300);

-- 2. Who owns a listing (kept out of the public listings table so user ids are never exposed) -----
create table if not exists public.listing_owners (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists listing_owners_user_idx on public.listing_owners (user_id);
alter table public.listing_owners enable row level security;

drop policy if exists "Owners read own ownership" on public.listing_owners;
create policy "Owners read own ownership" on public.listing_owners for select to authenticated using (user_id = auth.uid());
drop policy if exists "Admins manage ownership" on public.listing_owners;
create policy "Admins manage ownership" on public.listing_owners for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3. Claims: a signed-in contractor asks to manage a listing; an admin approves ----------------
create table if not exists public.listing_claims (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id    uuid not null references public.listings (id) on delete cascade,
  contact_name  text not null check (char_length(contact_name) between 2 and 120),
  contact_phone text check (char_length(contact_phone) <= 40),
  note          text check (char_length(note) <= 1000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  unique (user_id, listing_id)
);
-- The email comes from the signed-in session (default + policy below), so a claimant cannot type a different one.
alter table public.listing_claims add column if not exists user_email text default (auth.jwt() ->> 'email');
alter table public.listing_claims enable row level security;

drop policy if exists "Contractors file own claims" on public.listing_claims;
create policy "Contractors file own claims" on public.listing_claims for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and user_email = (auth.jwt() ->> 'email'));
drop policy if exists "Contractors read own claims" on public.listing_claims;
create policy "Contractors read own claims" on public.listing_claims for select to authenticated using (user_id = auth.uid());
drop policy if exists "Admins manage claims" on public.listing_claims;
create policy "Admins manage claims" on public.listing_claims for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4. Owners can read and edit their own listing (but never plan, status, slug or source) ----------
drop policy if exists "Owners read own listing" on public.listings;
create policy "Owners read own listing" on public.listings for select to authenticated
  using (exists (select 1 from public.listing_owners o where o.listing_id = listings.id and o.user_id = auth.uid()));

drop policy if exists "Owners update own listing" on public.listings;
create policy "Owners update own listing" on public.listings for update to authenticated
  using (exists (select 1 from public.listing_owners o where o.listing_id = listings.id and o.user_id = auth.uid()))
  with check (exists (select 1 from public.listing_owners o where o.listing_id = listings.id and o.user_id = auth.uid()));

create or replace function public.protect_listing_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins, the SQL editor and server code (service role) may change anything.
  if public.is_admin() or auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;
  new.id := old.id;
  new.slug := old.slug;
  new.status := old.status;
  new.plan := old.plan;
  new.plan_until := old.plan_until;
  new.source := old.source;
  new.source_url := old.source_url;
  new.google_place_id := old.google_place_id;
  new.attribution := old.attribution;
  new.rating_updated_at := old.rating_updated_at;
  return new;
end;
$$;

create or replace function public.stamp_rating_time()
returns trigger
language plpgsql
as $$
begin
  if new.google_rating is distinct from old.google_rating or new.google_review_count is distinct from old.google_review_count then
    new.rating_updated_at := case when new.google_rating is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_fields on public.listings;
create trigger listings_protect_fields before update on public.listings for each row execute function public.protect_listing_fields();
drop trigger if exists listings_stamp_rating on public.listings;
create trigger listings_stamp_rating before update on public.listings for each row execute function public.stamp_rating_time();

-- 5. Billing (written only by the Stripe webhook using the service role key) -----------------------
create table if not exists public.listing_billing (
  listing_id             uuid primary key references public.listings (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text,
  status                 text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
alter table public.listing_billing enable row level security;

drop policy if exists "Owners read own billing" on public.listing_billing;
create policy "Owners read own billing" on public.listing_billing for select to authenticated
  using (exists (select 1 from public.listing_owners o where o.listing_id = listing_billing.listing_id and o.user_id = auth.uid()));
drop policy if exists "Admins read billing" on public.listing_billing;
create policy "Admins read billing" on public.listing_billing for select to authenticated using (public.is_admin());

-- 6. Leads assigned to a contractor ------------------------------------------------------------------
alter table public.leads add column if not exists assigned_listing_id uuid references public.listings (id) on delete set null;
alter table public.leads add column if not exists assigned_at timestamptz;
alter table public.leads add column if not exists contractor_status text not null default 'new';
alter table public.leads drop constraint if exists leads_contractor_status_check;
alter table public.leads add constraint leads_contractor_status_check check (contractor_status in ('new', 'contacted', 'won', 'lost'));
alter table public.leads add column if not exists contractor_notes text check (char_length(contractor_notes) <= 2000);
create index if not exists leads_assigned_idx on public.leads (assigned_listing_id);

-- 7. Automatic lead routing ---------------------------------------------------------------------------
-- Every new lead is sent to Featured and Premium contractors that serve the customer's area (their city, or within their
-- travel radius of the customer's ZIP code). One lead goes to up to 3
-- contractors (Premium first, then whoever received a lead longest ago, so leads rotate fairly). Admins can add or remove
-- contractors by hand on a lead. Contractors never read the leads table: they see only leads sent to them, through the
-- functions below.
create table if not exists public.lead_assignments (
  lead_id           uuid not null references public.leads (id) on delete cascade,
  listing_id        uuid not null references public.listings (id) on delete cascade,
  assigned_at       timestamptz not null default now(),
  source            text not null default 'auto' check (source in ('auto', 'manual')),
  contractor_status text not null default 'new' check (contractor_status in ('new', 'contacted', 'won', 'lost')),
  contractor_notes  text check (char_length(contractor_notes) <= 2000),
  contacted_at      timestamptz,
  primary key (lead_id, listing_id)
);
create index if not exists lead_assignments_listing_idx on public.lead_assignments (listing_id, assigned_at desc);
alter table public.lead_assignments enable row level security;

drop policy if exists "Admins manage lead assignments" on public.lead_assignments;
create policy "Admins manage lead assignments" on public.lead_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Carry over leads that an earlier version assigned by hand.
insert into public.lead_assignments (lead_id, listing_id, assigned_at, source, contractor_status, contractor_notes)
select l.id, l.assigned_listing_id, coalesce(l.assigned_at, now()), 'manual', l.contractor_status, l.contractor_notes
from public.leads l
where l.assigned_listing_id is not null
on conflict do nothing;

-- "TX", "tx" and "Texas" all compare equal.
create or replace function public.norm_state(s text)
returns text
language sql
immutable
as $$
  select coalesce(
    (select v.name from (values
    ('al', 'alabama'),
    ('ak', 'alaska'),
    ('az', 'arizona'),
    ('ar', 'arkansas'),
    ('ca', 'california'),
    ('co', 'colorado'),
    ('ct', 'connecticut'),
    ('de', 'delaware'),
    ('fl', 'florida'),
    ('ga', 'georgia'),
    ('hi', 'hawaii'),
    ('id', 'idaho'),
    ('il', 'illinois'),
    ('in', 'indiana'),
    ('ia', 'iowa'),
    ('ks', 'kansas'),
    ('ky', 'kentucky'),
    ('la', 'louisiana'),
    ('me', 'maine'),
    ('md', 'maryland'),
    ('ma', 'massachusetts'),
    ('mi', 'michigan'),
    ('mn', 'minnesota'),
    ('ms', 'mississippi'),
    ('mo', 'missouri'),
    ('mt', 'montana'),
    ('ne', 'nebraska'),
    ('nv', 'nevada'),
    ('nh', 'new hampshire'),
    ('nj', 'new jersey'),
    ('nm', 'new mexico'),
    ('ny', 'new york'),
    ('nc', 'north carolina'),
    ('nd', 'north dakota'),
    ('oh', 'ohio'),
    ('ok', 'oklahoma'),
    ('or', 'oregon'),
    ('pa', 'pennsylvania'),
    ('ri', 'rhode island'),
    ('sc', 'south carolina'),
    ('sd', 'south dakota'),
    ('tn', 'tennessee'),
    ('tx', 'texas'),
    ('ut', 'utah'),
    ('vt', 'vermont'),
    ('va', 'virginia'),
    ('wa', 'washington'),
    ('wv', 'west virginia'),
    ('wi', 'wisconsin'),
    ('wy', 'wyoming'),
    ('dc', 'district of columbia')
    ) as v(abbr, name) where lower(btrim(s)) in (v.abbr, v.name) limit 1),
    lower(btrim(s))
  );
$$;

-- How far a contractor will travel, and where ZIP codes are (US Census data loaded once by scripts/load-zip-centroids.mjs).
alter table public.listings add column if not exists service_radius_miles int not null default 30;
alter table public.listings drop constraint if exists listings_service_radius_check;
alter table public.listings add constraint listings_service_radius_check check (service_radius_miles between 5 and 150);

create table if not exists public.zip_centroids (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  lat double precision not null,
  lng double precision not null
);
alter table public.zip_centroids enable row level security; -- no policies: read only by the routing function

-- First five digits of a US ZIP, or null ("78701-1234" and "78701" both give 78701).
create or replace function public.zip5(s text)
returns text
language sql
immutable
as $$
  select case when length(regexp_replace(coalesce(s, ''), '[^0-9]', '', 'g')) >= 5
              then left(regexp_replace(s, '[^0-9]', '', 'g'), 5) end;
$$;

-- Straight-line distance in miles.
create or replace function public.miles_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 3958.8 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Sends one lead to matching paid contractors. Returns how many contractors it was sent to.
-- A contractor matches when the lead is in their city or a city they list, OR when the customer's ZIP code is within the
-- contractor's own travel radius of the contractor's ZIP code. The customer's ZIP is used, not the typed city, so a mistyped city
-- cannot hide a lead. Order: Premium first, then local, then whoever received a lead longest ago, then nearest.
create or replace function public.route_lead(p_lead uuid, p_max int default 3)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads;
  v_lat double precision;
  v_lng double precision;
  n int := 0;
begin
  select * into l from public.leads where id = p_lead;
  if not found or l.status = 'spam' then
    return 0;
  end if;

  select z.lat, z.lng into v_lat, v_lng from public.zip_centroids z where z.zip = public.zip5(l.postal_code);

  insert into public.lead_assignments (lead_id, listing_id, source)
  select l.id, c.id, 'auto'
  from (
    select q.id
    from (
      select li.id, li.created_at, (li.plan = 'premium') as is_premium, li.service_radius_miles as radius,
             (select max(a.assigned_at) from public.lead_assignments a where a.listing_id = li.id) as last_at,
             (public.norm_state(li.state) = public.norm_state(l.state) and (
                lower(btrim(li.city)) = lower(btrim(l.city))
                or (li.service_areas is not null
                    and li.service_areas ~* ('\m' || regexp_replace(btrim(l.city), '([^a-zA-Z0-9 ])', '\\\1', 'g') || '\M'))
              )) as is_local,
             case when v_lat is not null and z.lat is not null then public.miles_between(v_lat, v_lng, z.lat, z.lng) end as miles
      from public.listings li
      join public.listing_owners o on o.listing_id = li.id
      left join public.zip_centroids z on z.zip = public.zip5(li.postal_code)
      where li.status = 'published'
        and li.plan in ('featured', 'premium')
        and (li.plan_until is null or li.plan_until > now())
    ) q
    where q.is_local or (q.miles is not null and q.miles <= q.radius)
    order by q.is_premium desc, q.is_local desc, q.last_at asc nulls first, q.miles asc nulls last, q.created_at
    limit greatest(p_max, 0)
  ) c
  on conflict do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Route every new lead as it arrives. A routing problem must never stop the lead being saved.
create or replace function public.leads_auto_route()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.route_lead(new.id);
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists leads_route_after_insert on public.leads;
create trigger leads_route_after_insert after insert on public.leads for each row execute function public.leads_auto_route();

-- Admin button: send an existing lead (for example one that arrived before this was set up) to matching contractors.
create or replace function public.admin_route_lead(p_lead uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return public.route_lead(p_lead);
end;
$$;

-- What a contractor sees: only leads sent to their own listing, only the fields they need.
drop function if exists public.my_leads();
create or replace function public.my_leads()
returns table (
  id uuid, created_at timestamptz, assigned_at timestamptz, source text, recipient_count int,
  issue text, urgency text, city text, state text, postal_code text, street text, unit text,
  first_name text, last_name text, phone text, email text, contact_method text, description text,
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
         l.issue, l.urgency, l.city, l.state, l.postal_code, l.street, l.unit,
         l.first_name, l.last_name, l.phone, l.email, l.contact_method, l.description,
         l.property_type, l.property_status, l.preferred_contact_time,
         a.contractor_status, a.contractor_notes, a.contacted_at
  from public.lead_assignments a
  join public.leads l on l.id = a.lead_id
  join public.listing_owners o on o.listing_id = a.listing_id
  where o.user_id = auth.uid() and l.status <> 'spam'
  order by a.assigned_at desc;
$$;

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
     and exists (select 1 from public.listing_owners o where o.listing_id = a.listing_id and o.user_id = auth.uid());
  if not found then
    raise exception 'Lead not found';
  end if;
end;
$$;

revoke all on function public.route_lead(uuid, int) from public, anon, authenticated;
revoke all on function public.leads_auto_route() from public, anon, authenticated;
revoke all on function public.admin_route_lead(uuid) from public, anon;
revoke all on function public.my_leads() from public, anon;
revoke all on function public.update_my_lead(uuid, text, text) from public, anon;
grant execute on function public.admin_route_lead(uuid) to authenticated;
grant execute on function public.my_leads() to authenticated;
grant execute on function public.update_my_lead(uuid, text, text) to authenticated;

-- 8. Email alerts for new leads -----------------------------------------------------------------------
-- When a lead is sent to a contractor, a row is queued here and a server function (/api/notify/send) is pinged to email them.
-- The email is only a heads-up with a link to the dashboard; the customer's contact details are never put in the email.
alter table public.listing_owners add column if not exists notify_email boolean not null default true;

create table if not exists public.lead_notifications (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at    timestamptz,
  attempts   int not null default 0,
  last_error text,
  unique (lead_id, listing_id)
);
create index if not exists lead_notifications_pending_idx on public.lead_notifications (created_at) where sent_at is null;
alter table public.lead_notifications enable row level security; -- no policies: only server code and the functions below can touch it

-- Where to ping when something is queued. Set once with the SQL in the README ("Turning on email alerts"). Never readable by clients.
create table if not exists public.notification_settings (
  id       int primary key default 1 check (id = 1),
  endpoint text,
  secret   text
);
alter table public.notification_settings enable row level security;

-- pg_net lets the database call a URL. It is available on Supabase; if it is missing, emails are still sent by the scheduled fallback.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net is not available; alerts will be sent by the scheduled fallback only';
end $$;

create or replace function public.queue_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.notification_settings;
begin
  begin
    insert into public.lead_notifications (lead_id, listing_id) values (new.lead_id, new.listing_id) on conflict do nothing;
    select * into cfg from public.notification_settings where id = 1;
    if cfg.endpoint is not null and cfg.secret is not null then
      begin
        execute 'select net.http_post(url := $1, headers := $2, body := $3)'
          using cfg.endpoint, jsonb_build_object('Content-Type', 'application/json', 'X-Notify-Secret', cfg.secret), '{"kick": true}'::jsonb;
      exception when others then
        null; -- the scheduled fallback will pick it up
      end;
    end if;
  exception when others then
    null; -- never block assigning a lead
  end;
  return null;
end;
$$;

drop trigger if exists lead_assignments_queue_notification on public.lead_assignments;
create trigger lead_assignments_queue_notification after insert on public.lead_assignments for each row execute function public.queue_lead_notification();

-- Server code claims a batch of pending alerts (safe if two senders run at once) and gets what it needs to write each email.
create or replace function public.claim_lead_notifications(p_limit int default 20)
returns table (
  id uuid, email text, business_name text, issue text, urgency text, city text, state text, lead_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Contractors who switched alerts off are marked done without sending.
  update public.lead_notifications n
     set sent_at = now(), last_error = 'alerts switched off'
    from public.listing_owners o
   where o.listing_id = n.listing_id and not o.notify_email and n.sent_at is null;

  return query
  with picked as (
    select n.id from public.lead_notifications n
     where n.sent_at is null and n.attempts < 5 and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
     order by n.created_at
     limit greatest(p_limit, 0)
     for update skip locked
  ), marked as (
    update public.lead_notifications n set attempts = n.attempts + 1, claimed_at = now()
      from picked where n.id = picked.id
    returning n.id, n.lead_id, n.listing_id
  )
  select m.id, u.email::text, li.business_name, l.issue, l.urgency, l.city, l.state, l.created_at
    from marked m
    join public.leads l on l.id = m.lead_id
    join public.listings li on li.id = m.listing_id
    join public.listing_owners o on o.listing_id = m.listing_id
    join auth.users u on u.id = o.user_id;
end;
$$;

create or replace function public.finish_lead_notifications(p_sent uuid[], p_failed jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_notifications set sent_at = now(), last_error = null where id = any (coalesce(p_sent, '{}'));
  update public.lead_notifications n set last_error = left(f.value, 300), claimed_at = null
    from jsonb_each_text(coalesce(p_failed, '{}'::jsonb)) f
   where n.id::text = f.key and n.sent_at is null;
end;
$$;

-- A contractor can switch their own alerts on or off.
create or replace function public.set_my_email_alerts(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.listing_owners set notify_email = p_on where user_id = auth.uid();
$$;

revoke all on function public.queue_lead_notification() from public, anon, authenticated;
revoke all on function public.claim_lead_notifications(int) from public, anon, authenticated;
revoke all on function public.finish_lead_notifications(uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.set_my_email_alerts(boolean) from public, anon;
grant execute on function public.claim_lead_notifications(int) to service_role;
grant execute on function public.finish_lead_notifications(uuid[], jsonb) to service_role;
grant execute on function public.set_my_email_alerts(boolean) to authenticated;
