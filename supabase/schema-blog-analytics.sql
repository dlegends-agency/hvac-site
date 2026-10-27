-- Run AFTER schema.sql. Supabase: SQL Editor > New query > paste > Run.

-- 1. Blog posts ---------------------------------------------------------------
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null,
  excerpt          text,
  meta_description text,
  content          text not null default '',
  status           text not null default 'draft' check (status in ('draft', 'published')),
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists posts_status_published_idx on public.posts (status, published_at desc);

alter table public.posts enable row level security;

drop policy if exists "Public can read published posts" on public.posts;
create policy "Public can read published posts"
  on public.posts for select to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins manage posts" on public.posts;
create policy "Admins manage posts"
  on public.posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. Page views (privacy-light: no IP, no user agent, random per-browser session id) ----
create table if not exists public.page_views (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  path          text not null check (char_length(path) <= 300),
  referrer_host text check (char_length(referrer_host) <= 200),
  utm_source    text check (char_length(utm_source) <= 100),
  device        text check (device in ('mobile', 'tablet', 'desktop')),
  session_id    text check (char_length(session_id) <= 64)
);
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);

alter table public.page_views enable row level security;

drop policy if exists "Anyone can record a page view" on public.page_views;
create policy "Anyone can record a page view"
  on public.page_views for insert to anon, authenticated
  with check (true);

drop policy if exists "Admins can read page views" on public.page_views;
create policy "Admins can read page views"
  on public.page_views for select to authenticated
  using (public.is_admin());

-- 3. Keep posts.updated_at fresh -------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_touch_updated_at on public.posts;
create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();
