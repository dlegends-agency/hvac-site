-- UPDATE 2026-11-05. Paste this whole file into Supabase > SQL Editor > New query and press Run. Safe to run more than once.
-- It contains three parts, in this order:
--   Part 1  About us is free for every plan (a free account may now edit its About us; services and areas stay paid).
--   Part 2  Everything in supabase/schema-profiles.sql: licence numbers and badges, opening hours, profile and cover photos,
--           customer recommendations (the business decides which to show and can feature one), and the photo storage area.
--   Part 3  Everything in supabase/schema-customers.sql: customer accounts that follow their own requests.
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
