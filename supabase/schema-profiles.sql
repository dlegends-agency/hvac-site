-- Run AFTER schema-contractors.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Adds richer business profiles: opening hours, a licence number with a "licence verified" mark, a "Verified by HVACHelp" mark,
-- and customer recommendations (email-confirmed, then approved by an admin before they show).

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
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_profile on public.listings;
create trigger listings_protect_profile before insert or update on public.listings for each row execute function public.protect_profile_fields();

-- 4. Recommendations ------------------------------------------------------------------------------------
-- A recommendation is written by a customer, confirmed through a link emailed to them, then approved by an admin.
-- The table is private: the website server (service role) adds rows, admins moderate them, and the public reads only the
-- approved, confirmed ones through the view below (which leaves out the email address and the confirmation token).
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
create unique index if not exists listing_recommendations_one_per_email on public.listing_recommendations (listing_id, lower(author_email));
create index if not exists listing_recommendations_listing_idx on public.listing_recommendations (listing_id, status);
create index if not exists listing_recommendations_token_idx on public.listing_recommendations (token_hash);

alter table public.listing_recommendations enable row level security;
drop policy if exists "Admins manage recommendations" on public.listing_recommendations;
create policy "Admins manage recommendations" on public.listing_recommendations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace view public.listing_recommendations_public as
  select r.id, r.listing_id, r.author_name, r.body, r.created_at
  from public.listing_recommendations r
  where r.status = 'approved' and r.email_confirmed_at is not null;
grant select on public.listing_recommendations_public to anon, authenticated;

create or replace view public.listing_recommendation_counts as
  select listing_id, count(*)::int as total
  from public.listing_recommendations
  where status = 'approved' and email_confirmed_at is not null
  group by listing_id;
grant select on public.listing_recommendation_counts to anon, authenticated;
