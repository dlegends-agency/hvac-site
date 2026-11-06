-- UPDATE 2026-11-05. Paste this whole file into Supabase > SQL Editor > New query and press Run. Safe to run more than once.
-- It contains five parts, in this order:
--   Part 1  About us is free for every plan (a free account may now edit its About us; services and areas stay paid).
--   Part 2  Everything in supabase/schema-profiles.sql: licence numbers and badges, opening hours, profile and cover photos,
--           customer recommendations (the business decides which to show and can feature one), and the photo storage area.
--   Part 3  Everything in supabase/schema-customers.sql: customer accounts that follow their own requests.
--   Part 4  Everything in supabase/schema-flow.sql: the request flow log, admin flow health, contractor performance and lead history.
--   Part 5  Everything in supabase/schema-messages.sql: messages between customers and Featured businesses, and the customer's request log.
-- It needs schema-contractors.sql to have been run before (it has, if the contractor dashboard already works).
-- It does NOT close the public form doors. Run supabase/lock-direct-inserts.sql separately, later, once the CAPTCHA is set up.
-- This file is a convenience copy of the scripts. The source of truth is the files named above under supabase/.

-- ==================================================================================================
-- Part 1: About us is free
-- ==================================================================================================
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
  -- Services and areas served are paid features: a free (or lapsed) account cannot change them. (About us is free for everyone.)
  if not (old.plan = 'featured' and (old.plan_until is null or old.plan_until > now())) then
    new.services := old.services;
    new.service_areas := old.service_areas;
  end if;
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

-- ==================================================================================================
-- Part 2: supabase/schema-profiles.sql
-- ==================================================================================================
-- Run AFTER schema-contractors.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Adds richer business profiles: opening hours, a licence number with a "licence verified" mark, a "Verified by HVACHelp" mark,
-- and customer recommendations (the business decides which to show and can feature one above "About us").

-- 1. Profile fields -------------------------------------------------------------------------------------
-- Licence number typed by the business (any plan). Shown as "Licence no. provided" until an admin checks it with the state.
alter table public.listings add column if not exists license_number text check (char_length(license_number) <= 40);
alter table public.listings add column if not exists license_verified_at timestamptz;
-- Set when an admin approved this business's claim, so we know a real person for the business manages the listing.
-- The public "Verified by HVACHelp" mark needs this AND a paid plan.
alter table public.listings add column if not exists verified_at timestamptz;
-- Opening hours (paid plan): {"mon": {"open": "08:00", "close": "17:00"}, "sun": null, ...}. A missing or null day means closed.
alter table public.listings add column if not exists business_hours jsonb;
alter table public.listings drop constraint if exists listings_business_hours_check;
alter table public.listings add constraint listings_business_hours_check
  check (business_hours is null or (jsonb_typeof(business_hours) = 'object' and pg_column_size(business_hours) <= 1500));

-- Profile picture and cover photo (paid plan): paths inside the public "listing-images" storage bucket, always "<listing id>/<file>".
alter table public.listings add column if not exists avatar_path text;
alter table public.listings add column if not exists cover_image_path text;
alter table public.listings drop constraint if exists listings_avatar_path_check;
alter table public.listings add constraint listings_avatar_path_check
  check (avatar_path is null or (char_length(avatar_path) <= 200 and avatar_path like id::text || '/%'));
alter table public.listings drop constraint if exists listings_cover_image_path_check;
alter table public.listings add constraint listings_cover_image_path_check
  check (cover_image_path is null or (char_length(cover_image_path) <= 200 and cover_image_path like id::text || '/%'));

-- Anyone already approved as an owner counts as verified.
update public.listings l set verified_at = now()
  where verified_at is null and exists (select 1 from public.listing_owners o where o.listing_id = l.id);

-- 2. Keep verified_at in step with ownership ------------------------------------------------------------
create or replace function public.sync_listing_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set verified_at = coalesce(verified_at, now()) where id = new.listing_id;
    return new;
  end if;
  update public.listings set verified_at = null where id = old.listing_id;
  return old;
end;
$$;

drop trigger if exists listing_owners_sync_verified on public.listing_owners;
create trigger listing_owners_sync_verified after insert or delete on public.listing_owners for each row execute function public.sync_listing_verified();

-- 3. Who may set the new fields -------------------------------------------------------------------------
-- Admins, the SQL editor and server code may set anything. Everyone else (owners and the public form) cannot set the
-- verified marks, cannot keep a "licence verified" mark after changing the number, and cannot set hours on a free plan.
-- (Separate from protect_listing_fields so re-running schema-contractors.sql does not undo it.)
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No role at all means the SQL editor or a database job. Signed-out visitors have the role "anon", so they are NOT exempt.
  if public.is_admin() or auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- A public submission is always a free, unverified listing.
    new.verified_at := null;
    new.license_verified_at := null;
    new.business_hours := null;
    new.avatar_path := null;
    new.cover_image_path := null;
    new.plan := 'free';
    new.plan_until := null;
    new.google_place_id := null;
    return new;
  end if;
  new.verified_at := old.verified_at;
  new.license_verified_at := old.license_verified_at;
  if new.license_number is distinct from old.license_number then
    new.license_verified_at := null;
  end if;
  if not (old.plan = 'featured' and (old.plan_until is null or old.plan_until > now())) then
    new.business_hours := old.business_hours;
    -- Photos are a paid feature too (a lapsed plan keeps the file but cannot change which photo is shown).
    new.avatar_path := old.avatar_path;
    new.cover_image_path := old.cover_image_path;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_profile on public.listings;
create trigger listings_protect_profile before insert or update on public.listings for each row execute function public.protect_profile_fields();

-- 4. Recommendations ------------------------------------------------------------------------------------
-- A customer writes a recommendation on a listing page. It is saved here as "pending". The business (the listing's owner) reads it in
-- its dashboard and decides whether to show it, and may pick ONE approved recommendation to feature above its "About us". If a business
-- has no owner yet, an admin decides. When email sending is set up, the customer also confirms their email address (shown as a small
-- "email confirmed" note); the recommendation is saved either way. The table is private: the website server (service role) adds rows,
-- owners use the functions below, admins manage everything, and the public reads only approved ones through the view below (which
-- leaves out the email address and the confirmation token).
create table if not exists public.listing_recommendations (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  listing_id         uuid not null references public.listings (id) on delete cascade,
  author_name        text not null check (char_length(author_name) between 2 and 60),
  author_email       text not null check (char_length(author_email) between 5 and 200),
  body               text not null check (char_length(body) between 20 and 1000),
  token_hash         text not null,
  email_confirmed_at timestamptz,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderated_at       timestamptz
);
-- Hash of the sender's network address (never the address itself), used only to limit how many a single sender can post per day.
alter table public.listing_recommendations add column if not exists ip_hash text;
-- The one recommendation a business features above "About us" (paid plan).
alter table public.listing_recommendations add column if not exists featured boolean not null default false;
alter table public.listing_recommendations drop constraint if exists listing_recommendations_featured_check;
alter table public.listing_recommendations add constraint listing_recommendations_featured_check check (not featured or status = 'approved');
create unique index if not exists listing_recommendations_one_per_email on public.listing_recommendations (listing_id, lower(author_email));
create unique index if not exists listing_recommendations_one_featured on public.listing_recommendations (listing_id) where featured;
create index if not exists listing_recommendations_listing_idx on public.listing_recommendations (listing_id, status);
create index if not exists listing_recommendations_token_idx on public.listing_recommendations (token_hash);
create index if not exists listing_recommendations_ip_idx on public.listing_recommendations (ip_hash, created_at);

alter table public.listing_recommendations enable row level security;
drop policy if exists "Admins manage recommendations" on public.listing_recommendations;
create policy "Admins manage recommendations" on public.listing_recommendations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Public: approved recommendations only. (New columns go last so the view can be replaced in place.)
create or replace view public.listing_recommendations_public as
  select r.id, r.listing_id, r.author_name, r.body, r.created_at,
         r.featured, (r.email_confirmed_at is not null) as email_confirmed
  from public.listing_recommendations r
  where r.status = 'approved';
grant select on public.listing_recommendations_public to anon, authenticated;

create or replace view public.listing_recommendation_counts as
  select listing_id, count(*)::int as total
  from public.listing_recommendations
  where status = 'approved'
  group by listing_id;
grant select on public.listing_recommendation_counts to anon, authenticated;

-- What a business sees: the recommendations written about its own listing (never the customer's email address).
create or replace function public.my_recommendations()
returns table (id uuid, created_at timestamptz, author_name text, body text, email_confirmed boolean, status text, featured boolean)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.created_at, r.author_name, r.body, (r.email_confirmed_at is not null), r.status, r.featured
  from public.listing_recommendations r
  join public.listing_owners o on o.listing_id = r.listing_id
  where o.user_id = auth.uid()
  order by r.created_at desc;
$$;

-- The business shows ("approved") or hides ("rejected") a recommendation, or puts it back to "pending". Hiding also un-features it.
create or replace function public.decide_my_recommendation(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid status';
  end if;
  update public.listing_recommendations r
     set status = p_status, moderated_at = now(), featured = (r.featured and p_status = 'approved')
   where r.id = p_id
     and exists (select 1 from public.listing_owners o where o.listing_id = r.listing_id and o.user_id = auth.uid());
  if not found then
    raise exception 'Recommendation not found';
  end if;
end;
$$;

-- Feature one approved recommendation above "About us" (paid plan), replacing any earlier one. p_on = false removes the feature.
create or replace function public.feature_my_recommendation(p_id uuid, p_on boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
begin
  select r.listing_id into v_listing
    from public.listing_recommendations r
    join public.listing_owners o on o.listing_id = r.listing_id
   where r.id = p_id and o.user_id = auth.uid();
  if v_listing is null then
    raise exception 'Recommendation not found';
  end if;
  if not p_on then
    update public.listing_recommendations set featured = false where id = p_id;
    return;
  end if;
  if not exists (select 1 from public.listings l where l.id = v_listing and l.plan = 'featured' and (l.plan_until is null or l.plan_until > now())) then
    raise exception 'Featuring a recommendation needs the Featured plan';
  end if;
  if not exists (select 1 from public.listing_recommendations where id = p_id and status = 'approved') then
    raise exception 'Show this recommendation first';
  end if;
  update public.listing_recommendations set featured = false where listing_id = v_listing and featured and id <> p_id;
  update public.listing_recommendations set featured = true where id = p_id;
end;
$$;

revoke all on function public.my_recommendations() from public, anon;
revoke all on function public.decide_my_recommendation(uuid, text) from public, anon;
revoke all on function public.feature_my_recommendation(uuid, boolean) from public, anon;
grant execute on function public.my_recommendations() to authenticated;
grant execute on function public.decide_my_recommendation(uuid, text) to authenticated;
grant execute on function public.feature_my_recommendation(uuid, boolean) to authenticated;

-- 5. Photo storage ------------------------------------------------------------------------------------------
-- A public bucket (anyone can view a photo by its address). Only the owner of a listing on an active paid plan can add or replace
-- files in that listing's folder; owners can always delete their own files. Photos are limited to 2 MB and to JPEG, PNG or WebP.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage was not found: the listing-images bucket was not created.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('listing-images', 'listing-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

  drop policy if exists "Paid owners add listing images" on storage.objects;
  create policy "Paid owners add listing images" on storage.objects for insert to authenticated
    with check (
      bucket_id = 'listing-images'
      and exists (
        select 1 from public.listing_owners o join public.listings l on l.id = o.listing_id
        where o.user_id = auth.uid() and l.id::text = (storage.foldername(name))[1]
          and l.plan = 'featured' and (l.plan_until is null or l.plan_until > now())
      )
    );

  drop policy if exists "Paid owners replace listing images" on storage.objects;
  create policy "Paid owners replace listing images" on storage.objects for update to authenticated
    using (
      bucket_id = 'listing-images'
      and exists (
        select 1 from public.listing_owners o join public.listings l on l.id = o.listing_id
        where o.user_id = auth.uid() and l.id::text = (storage.foldername(name))[1]
          and l.plan = 'featured' and (l.plan_until is null or l.plan_until > now())
      )
    );

  -- Deleting a file also needs permission to see it (Supabase checks "select" for "delete ... returning").
  drop policy if exists "Owners see their listing images" on storage.objects;
  create policy "Owners see their listing images" on storage.objects for select to authenticated
    using (
      bucket_id = 'listing-images'
      and exists (select 1 from public.listing_owners o where o.user_id = auth.uid() and o.listing_id::text = (storage.foldername(name))[1])
    );

  drop policy if exists "Owners delete listing images" on storage.objects;
  create policy "Owners delete listing images" on storage.objects for delete to authenticated
    using (
      bucket_id = 'listing-images'
      and exists (select 1 from public.listing_owners o where o.user_id = auth.uid() and o.listing_id::text = (storage.foldername(name))[1])
    );
end
$$;

-- ==================================================================================================
-- Part 3: supabase/schema-customers.sql
-- ==================================================================================================
-- Run AFTER schema-contractors.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Customer accounts: a person who asks for HVAC help can sign in and follow their requests (which businesses got it and whether
-- they have been in touch). Requests are linked to the account when the customer is signed in while sending them, and requests sent
-- earlier with the same email address are shown once that email address is confirmed.

alter table public.leads add column if not exists customer_id uuid references auth.users (id) on delete set null;
create index if not exists leads_customer_idx on public.leads (customer_id);
create index if not exists leads_email_lower_idx on public.leads (lower(email));

-- The signed-in customer's own requests. Contractors' private notes are never included; for each business only its public details
-- and whether it has marked the request as contacted.
drop function if exists public.my_requests();
create or replace function public.my_requests()
returns table (
  id uuid, created_at timestamptz, issue text, urgency text, city text, state text, postal_code text, street text,
  description text, status text, businesses jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.created_at, l.issue, l.urgency, l.city, l.state, l.postal_code, l.street, l.description, l.status,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'listing_id', b.id, 'messages', (a.unlocked_at is not null),
                    'name', b.business_name, 'slug', b.slug, 'city', b.city, 'state', b.state, 'phone', b.phone,
                    'status', a.contractor_status, 'sent_at', a.assigned_at, 'contacted_at', a.contacted_at
                  ) order by a.assigned_at)
             from public.lead_assignments a
             join public.listings b on b.id = a.listing_id and b.status = 'published'
            where a.lead_id = l.id
         ), '[]'::jsonb)
  from public.leads l
  where l.status <> 'spam'
    and auth.uid() is not null
    and (
      l.customer_id = auth.uid()
      -- Older requests with the same email address, but only once the account's email address has been confirmed.
      or lower(l.email) = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    )
  order by l.created_at desc;
$$;

revoke all on function public.my_requests() from public, anon;
grant execute on function public.my_requests() to authenticated;

-- ==================================================================================================
-- Part 4: supabase/schema-flow.sql
-- ==================================================================================================
-- Run AFTER schema-customers.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- The request flow log: every step a customer request goes through is written down as it happens, so an admin can see what happened to
-- a request, a contractor can see the history of their own leads, and the dashboards can show what is stuck. Also adds the admin
-- "flow health" numbers and the contractor "performance" numbers.

-- 1. The log -------------------------------------------------------------------------------------------
create table if not exists public.lead_events (
  id         bigint generated by default as identity primary key,
  created_at timestamptz not null default clock_timestamp(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  -- received, routed, no_match, spam, assigned, unassigned, alert_queued, alert_sent, alert_failed, unlocked, contacted, won, lost,
  -- reopened, lead_status
  kind       text not null check (char_length(kind) <= 40),
  detail     text check (char_length(detail) <= 300)
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, id);
create index if not exists lead_events_recent_idx on public.lead_events (id desc);
create index if not exists lead_events_kind_idx on public.lead_events (kind, id desc);

alter table public.lead_events enable row level security;
drop policy if exists "Admins read the flow log" on public.lead_events;
create policy "Admins read the flow log" on public.lead_events for select to authenticated using (public.is_admin());

-- Writes the log. Never breaks the thing being logged.
create or replace function public.log_lead_event(p_lead uuid, p_listing uuid, p_kind text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_events (lead_id, listing_id, kind, detail) values (p_lead, p_listing, p_kind, left(p_detail, 300));
exception when others then
  null;
end;
$$;
revoke all on function public.log_lead_event(uuid, uuid, text, text) from public, anon, authenticated;

-- 2. What writes it ------------------------------------------------------------------------------------
-- Trigger names decide the order they run in: "a" runs before the routing trigger (leads_route_after_insert), "z" after it.
create or replace function public.trg_lead_received()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_lead_event(new.id, null, 'received', new.source);
  return null;
end;
$$;
drop trigger if exists leads_a_log_received on public.leads;
create trigger leads_a_log_received after insert on public.leads for each row execute function public.trg_lead_received();

create or replace function public.trg_lead_routed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if new.status = 'spam' then
    perform public.log_lead_event(new.id, null, 'spam', 'Marked as spam, not sent to any business');
    return null;
  end if;
  select count(*)::int into n from public.lead_assignments where lead_id = new.id;
  if n > 0 then
    perform public.log_lead_event(new.id, null, 'routed', n || case when n = 1 then ' business' else ' businesses' end);
  else
    perform public.log_lead_event(new.id, null, 'no_match', 'No matching business yet');
  end if;
  return null;
end;
$$;
drop trigger if exists leads_z_log_routed on public.leads;
create trigger leads_z_log_routed after insert on public.leads for each row execute function public.trg_lead_routed();

create or replace function public.trg_lead_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.log_lead_event(new.id, null, 'lead_status', new.status);
  end if;
  return null;
end;
$$;
drop trigger if exists leads_log_status on public.leads;
create trigger leads_log_status after update of status on public.leads for each row execute function public.trg_lead_status();

create or replace function public.trg_assignment_logged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_lead_event(new.lead_id, new.listing_id, 'assigned', new.source);
  elsif tg_op = 'DELETE' then
    perform public.log_lead_event(old.lead_id, old.listing_id, 'unassigned', null);
  else
    if new.unlocked_at is not null and old.unlocked_at is null then
      perform public.log_lead_event(new.lead_id, new.listing_id, 'unlocked',
        case when new.unlock_cents is null then 'free or by an admin' else '$' || to_char(new.unlock_cents / 100.0, 'FM999990.00') end);
    end if;
    if new.contractor_status is distinct from old.contractor_status then
      perform public.log_lead_event(new.lead_id, new.listing_id, case new.contractor_status when 'new' then 'reopened' else new.contractor_status end, null);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists lead_assignments_log on public.lead_assignments;
create trigger lead_assignments_log after insert or update or delete on public.lead_assignments for each row execute function public.trg_assignment_logged();

create or replace function public.trg_notification_logged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_lead_event(new.lead_id, new.listing_id, 'alert_queued', null);
  else
    if new.sent_at is not null and old.sent_at is null then
      perform public.log_lead_event(new.lead_id, new.listing_id, 'alert_sent', null);
    end if;
    if new.last_error is not null and new.last_error is distinct from old.last_error then
      perform public.log_lead_event(new.lead_id, new.listing_id, 'alert_failed', new.last_error);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists lead_notifications_log on public.lead_notifications;
create trigger lead_notifications_log after insert or update on public.lead_notifications for each row execute function public.trg_notification_logged();

-- Requests and assignments that existed before this script get their first steps written down with their real times. Runs once per lead.
insert into public.lead_events (created_at, lead_id, listing_id, kind, detail)
select l.created_at, l.id, null, 'received', l.source from public.leads l
 where not exists (select 1 from public.lead_events e where e.lead_id = l.id);
insert into public.lead_events (created_at, lead_id, listing_id, kind, detail)
select a.assigned_at, a.lead_id, a.listing_id, 'assigned', a.source from public.lead_assignments a
 where not exists (select 1 from public.lead_events e where e.lead_id = a.lead_id and e.kind = 'assigned' and e.listing_id = a.listing_id);
insert into public.lead_events (created_at, lead_id, listing_id, kind, detail)
select a.unlocked_at, a.lead_id, a.listing_id, 'unlocked',
       case when a.unlock_cents is null then 'free or by an admin' else '$' || to_char(a.unlock_cents / 100.0, 'FM999990.00') end
  from public.lead_assignments a
 where a.unlocked_at is not null
   and not exists (select 1 from public.lead_events e where e.lead_id = a.lead_id and e.kind = 'unlocked' and e.listing_id = a.listing_id);

-- 3. Admin: what is stuck -------------------------------------------------------------------------------
create or replace function public.admin_flow_health()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return jsonb_build_object(
    'leads_24h', (select count(*) from public.leads where created_at > now() - interval '24 hours' and status <> 'spam'),
    'leads_7d', (select count(*) from public.leads where created_at > now() - interval '7 days' and status <> 'spam'),
    -- Requests older than 10 minutes that no business has received.
    'unmatched', (select count(*) from public.leads l where l.status <> 'spam' and l.created_at < now() - interval '10 minutes'
                    and not exists (select 1 from public.lead_assignments a where a.lead_id = l.id)),
    -- Alert emails that failed, and ones still waiting after 30 minutes (usually email sending is not set up).
    'alerts_failed', (select count(*) from public.lead_notifications where sent_at is null and last_error is not null),
    'alerts_waiting', (select count(*) from public.lead_notifications where sent_at is null and created_at < now() - interval '30 minutes'),
    -- Unlocked by a business 48 hours ago or more, but never marked as contacted.
    'unlocked_not_contacted', (select count(*) from public.lead_assignments where unlocked_at < now() - interval '48 hours' and contractor_status = 'new'),
    'unlocks_30d', (select count(*) from public.lead_assignments where unlocked_at > now() - interval '30 days'),
    'unlock_cents_30d', (select coalesce(sum(unlock_cents), 0) from public.lead_assignments where unlocked_at > now() - interval '30 days')
  );
end;
$$;

create or replace function public.admin_unmatched_leads()
returns table (id uuid, created_at timestamptz, issue text, city text, state text, postal_code text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select l.id, l.created_at, l.issue, l.city, l.state, l.postal_code
      from public.leads l
     where l.status <> 'spam' and l.created_at < now() - interval '10 minutes'
       and not exists (select 1 from public.lead_assignments a where a.lead_id = l.id)
     order by l.created_at desc
     limit 50;
end;
$$;

-- 4. Contractor: own performance and own lead history -----------------------------------------------------
create or replace function public.my_performance()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with mine as (
    select a.* from public.lead_assignments a
      join public.listing_owners o on o.listing_id = a.listing_id
     where o.user_id = auth.uid() and a.assigned_at > now() - interval '30 days'
  )
  select jsonb_build_object(
    'received', (select count(*) from mine),
    'unlocked', (select count(*) from mine where unlocked_at is not null),
    'contacted', (select count(*) from mine where contractor_status in ('contacted', 'won', 'lost')),
    'won', (select count(*) from mine where contractor_status = 'won'),
    'lost', (select count(*) from mine where contractor_status = 'lost'),
    'waiting_to_unlock', (select count(*) from mine where unlocked_at is null),
    'spent_cents', (select coalesce(sum(unlock_cents), 0) from mine where unlocked_at is not null),
    -- Typical time from receiving a request to marking it contacted, in hours.
    'median_hours_to_contact', (select round((percentile_cont(0.5) within group (order by extract(epoch from (contacted_at - assigned_at)) / 3600.0))::numeric, 1)
                                  from mine where contacted_at is not null)
  );
$$;

-- The history of one lead for the business that received it: its own steps only, never other businesses or the customer's details.
create or replace function public.my_lead_events(p_lead uuid)
returns table (created_at timestamptz, kind text, detail text)
language sql
security definer
set search_path = public
stable
as $$
  select e.created_at, e.kind, e.detail
    from public.lead_events e
   where e.lead_id = p_lead
     and exists (select 1 from public.lead_assignments a join public.listing_owners o on o.listing_id = a.listing_id
                  where a.lead_id = p_lead and o.user_id = auth.uid())
     and (
       e.kind = 'received'
       or (e.kind in ('assigned', 'alert_sent', 'unlocked', 'contacted', 'won', 'lost', 'reopened')
           and e.listing_id in (select o.listing_id from public.listing_owners o where o.user_id = auth.uid()))
     )
   order by e.id;
$$;

revoke all on function public.admin_flow_health() from public, anon;
revoke all on function public.admin_unmatched_leads() from public, anon;
revoke all on function public.my_performance() from public, anon;
revoke all on function public.my_lead_events(uuid) from public, anon;
grant execute on function public.admin_flow_health() to authenticated;
grant execute on function public.admin_unmatched_leads() to authenticated;
grant execute on function public.my_performance() to authenticated;
grant execute on function public.my_lead_events(uuid) to authenticated;

-- ==================================================================================================
-- Part 5: supabase/schema-messages.sql
-- ==================================================================================================
-- Run AFTER schema-flow.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Messages between a customer and a business that received their request.
--   * A conversation opens when the business has paid to unlock the customer's request. Until then it is locked for both sides.
--   * Once unlocked, the business can write to the customer and the customer can reply or write to that business.
--   * Messages stay inside the site. A business never sees the customer's phone or email through a message.
--   * Nobody reads the table directly: every read and write goes through the functions below, which check who is asking.
--   * It also adds the customer-facing request log (my_request_log).

create table if not exists public.lead_messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  sender     text not null check (sender in ('business', 'customer')),
  sender_id  uuid default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at    timestamptz
);
create index if not exists lead_messages_thread_idx on public.lead_messages (lead_id, listing_id, id);
create index if not exists lead_messages_listing_idx on public.lead_messages (listing_id, created_at desc);
alter table public.lead_messages enable row level security;

revoke all on public.lead_messages from anon, authenticated;
grant select on public.lead_messages to authenticated;
drop policy if exists "Admins read messages" on public.lead_messages;
create policy "Admins read messages" on public.lead_messages for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- who is who
create or replace function public.listing_is_paid(p_listing uuid)
returns boolean language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.listings l where l.id = p_listing and l.plan = 'featured' and (l.plan_until is null or l.plan_until > now())) $$;

create or replace function public.owns_listing(p_listing uuid)
returns boolean language sql security definer set search_path = public stable
as $$ select auth.uid() is not null and exists (select 1 from public.listing_owners o where o.listing_id = p_listing and o.user_id = auth.uid()) $$;

-- The same rule as my_requests(): the request is linked to the account, or sent earlier with the account's confirmed email address.
create or replace function public.is_customer_of_lead(p_lead uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select auth.uid() is not null and exists (
    select 1 from public.leads l
     where l.id = p_lead and l.status <> 'spam'
       and (l.customer_id = auth.uid()
            or lower(l.email) = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null))
  )
$$;

revoke all on function public.listing_is_paid(uuid), public.owns_listing(uuid), public.is_customer_of_lead(uuid) from public, anon;
grant execute on function public.listing_is_paid(uuid), public.owns_listing(uuid), public.is_customer_of_lead(uuid) to authenticated;

-- ---------------------------------------------------------------- send
create or replace function public.send_message(p_lead uuid, p_listing uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender text;
  v_body   text := btrim(coalesce(p_body, ''));
  v_id     bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'A message is 1 to 2000 characters'; end if;
  if not exists (select 1 from public.lead_assignments a where a.lead_id = p_lead and a.listing_id = p_listing) then
    raise exception 'That business did not receive this request' using errcode = '42501';
  end if;
  if public.owns_listing(p_listing) then v_sender := 'business';
  elsif public.is_customer_of_lead(p_lead) then v_sender := 'customer';
  else raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lead_assignments a where a.lead_id = p_lead and a.listing_id = p_listing and a.unlocked_at is not null) then
    raise exception 'Unlock this request to send messages' using errcode = '42501';
  end if;
  if (select count(*) from public.lead_messages m where m.lead_id = p_lead and m.listing_id = p_listing and m.sender = v_sender
        and m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages. Please wait a little.';
  end if;
  insert into public.lead_messages (lead_id, listing_id, sender, body) values (p_lead, p_listing, v_sender, v_body) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- the customer's conversations
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  lead_id uuid, listing_id uuid, business_name text, slug text, issue text, requested_at timestamptz,
  can_send boolean, last_body text, last_sender text, last_at timestamptz, unread int
)
language sql
security definer
set search_path = public
stable
as $$
  select a.lead_id, a.listing_id, b.business_name, b.slug, l.issue, l.created_at,
         (a.unlocked_at is not null),
         lm.body, lm.sender, lm.created_at,
         (select count(*)::int from public.lead_messages m where m.lead_id = a.lead_id and m.listing_id = a.listing_id and m.sender = 'business' and m.read_at is null)
    from public.lead_assignments a
    join public.leads l on l.id = a.lead_id
    join public.listings b on b.id = a.listing_id and b.status = 'published'
    left join lateral (select m.body, m.sender, m.created_at from public.lead_messages m
                        where m.lead_id = a.lead_id and m.listing_id = a.listing_id order by m.id desc limit 1) lm on true
   where public.is_customer_of_lead(a.lead_id)
     and (lm.body is not null or a.unlocked_at is not null)
   order by lm.created_at desc nulls last, a.assigned_at desc;
$$;

-- ---------------------------------------------------------------- the business's conversations
-- Customers who have written, and the request named in p_lead (so a business can start a conversation from a request).
-- The customer's first name is shown only once the business has unlocked the request.
drop function if exists public.business_conversations(uuid);
create or replace function public.business_conversations(p_lead uuid default null)
returns table (
  lead_id uuid, listing_id uuid, customer text, issue text, city text, state text, requested_at timestamptz,
  can_send boolean, last_body text, last_sender text, last_at timestamptz, unread int
)
language sql
security definer
set search_path = public
stable
as $$
  select a.lead_id, a.listing_id,
         case when a.unlocked_at is not null then l.first_name else 'Customer' end,
         l.issue, l.city, l.state, l.created_at,
         (a.unlocked_at is not null),
         lm.body, lm.sender, lm.created_at,
         (select count(*)::int from public.lead_messages m where m.lead_id = a.lead_id and m.listing_id = a.listing_id and m.sender = 'customer' and m.read_at is null)
    from public.lead_assignments a
    join public.leads l on l.id = a.lead_id and l.status <> 'spam'
    left join lateral (select m.body, m.sender, m.created_at from public.lead_messages m
                        where m.lead_id = a.lead_id and m.listing_id = a.listing_id order by m.id desc limit 1) lm on true
   where public.owns_listing(a.listing_id)
     and (lm.body is not null or a.lead_id = p_lead)
   order by lm.created_at desc nulls last, a.assigned_at desc;
$$;

-- ---------------------------------------------------------------- read one conversation
-- Returns the messages to whoever is in the conversation, and marks the other side's messages as read.
drop function if exists public.conversation_messages(uuid, uuid);
create or replace function public.conversation_messages(p_lead uuid, p_listing uuid)
returns table (id bigint, created_at timestamptz, sender text, body text, mine boolean, read_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.lead_assignments a where a.lead_id = p_lead and a.listing_id = p_listing) then return; end if;
  if public.owns_listing(p_listing) then v_role := 'business';
  elsif public.is_customer_of_lead(p_lead) then v_role := 'customer';
  else return;
  end if;
  update public.lead_messages m set read_at = now()
   where m.lead_id = p_lead and m.listing_id = p_listing and m.sender <> v_role and m.read_at is null;
  return query
    select m.id, m.created_at, m.sender, m.body, (m.sender = v_role), m.read_at
      from public.lead_messages m where m.lead_id = p_lead and m.listing_id = p_listing order by m.id;
end;
$$;

-- Unread messages for the signed-in person, as a customer and as a business (for the badge in the menus).
create or replace function public.my_unread_messages()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'as_customer', (select count(*) from public.lead_messages m where m.sender = 'business' and m.read_at is null and public.is_customer_of_lead(m.lead_id)),
    'as_business', (select count(*) from public.lead_messages m where m.sender = 'customer' and m.read_at is null and public.owns_listing(m.listing_id))
  )
$$;

-- ---------------------------------------------------------------- the customer's request log
-- What happened to one of the customer's own requests, in plain steps. No other business's private steps, no money, no notes.
drop function if exists public.my_request_log(uuid);
create or replace function public.my_request_log(p_lead uuid)
returns table (created_at timestamptz, kind text, business_name text)
language sql
security definer
set search_path = public
stable
as $$
  select * from (
    select e.created_at,
           case e.kind when 'received' then 'received' when 'no_match' then 'no_match' when 'assigned' then 'sent'
                       when 'contacted' then 'contacted' when 'lead_status' then 'closed' end as kind,
           b.business_name
      from public.lead_events e
      left join public.listings b on b.id = e.listing_id
     where e.lead_id = p_lead
       and (e.kind in ('received', 'no_match', 'assigned', 'contacted') or (e.kind = 'lead_status' and e.detail = 'closed'))
    union all
    select m.created_at, case m.sender when 'business' then 'message_in' else 'message_out' end, b.business_name
      from public.lead_messages m
      join public.listings b on b.id = m.listing_id
     where m.lead_id = p_lead
  ) x
  where public.is_customer_of_lead(p_lead)
  order by created_at;
$$;

revoke all on function public.send_message(uuid, uuid, text), public.my_conversations(), public.business_conversations(uuid),
  public.conversation_messages(uuid, uuid), public.my_unread_messages(), public.my_request_log(uuid) from public, anon;
grant execute on function public.send_message(uuid, uuid, text), public.my_conversations(), public.business_conversations(uuid),
  public.conversation_messages(uuid, uuid), public.my_unread_messages(), public.my_request_log(uuid) to authenticated;
