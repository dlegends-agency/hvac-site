-- Run AFTER schema.sql and schema-blog-analytics.sql. Supabase: SQL Editor > New query > paste > Run.

-- 1. Blog cover images ---------------------------------------------------------
alter table public.posts add column if not exists cover_image text;

-- 2. Contractor directory -------------------------------------------------------
create table if not exists public.listings (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status          text not null default 'pending' check (status in ('pending', 'published', 'hidden')),

  business_name   text not null check (char_length(business_name) between 2 and 120),
  description     text check (char_length(description) <= 2000),
  services        text[] not null default '{}',
  emergency_service boolean not null default false,

  phone           text check (char_length(phone) <= 40),
  email           text check (char_length(email) <= 200),
  website         text check (char_length(website) <= 300),

  address         text check (char_length(address) <= 200),
  city            text not null check (char_length(city) <= 100),
  state           text not null check (char_length(state) <= 100),
  postal_code     text check (char_length(postal_code) <= 20),
  service_areas   text check (char_length(service_areas) <= 500)
);
create index if not exists listings_status_idx on public.listings (status, state, city);

alter table public.listings enable row level security;

-- Public can read PUBLISHED listings only (private columns are hidden by the column grants further down).
drop policy if exists "Public can read published listings" on public.listings;
create policy "Public can read published listings"
  on public.listings for select to anon, authenticated
  using (status = 'published');

-- Anyone can submit a business for review; it always starts as pending.
drop policy if exists "Anyone can submit a listing" on public.listings;
create policy "Anyone can submit a listing"
  on public.listings for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Admins manage listings" on public.listings;
create policy "Admins manage listings"
  on public.listings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Private details live in their own table so they can never be read through the public listings API.
create table if not exists public.listing_private (
  listing_id      uuid primary key references public.listings (id) on delete cascade,
  submitter_name  text check (char_length(submitter_name) <= 120),
  submitter_email text check (char_length(submitter_email) <= 200),
  admin_notes     text
);
alter table public.listing_private enable row level security;

drop policy if exists "Anyone can add submitter details" on public.listing_private;
create policy "Anyone can add submitter details"
  on public.listing_private for insert to anon, authenticated
  with check (admin_notes is null);

drop policy if exists "Admins manage private details" on public.listing_private;
create policy "Admins manage private details"
  on public.listing_private for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists listings_touch_updated_at on public.listings;
create trigger listings_touch_updated_at
  before update on public.listings
  for each row execute function public.touch_updated_at();
