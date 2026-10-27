-- Run this in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- 1. Leads ------------------------------------------------------------------
create table if not exists public.leads (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  status                  text not null default 'new'
                          check (status in ('new', 'contacted', 'closed', 'spam')),
  notes                   text,
  idempotency_key         text unique,
  source                  text,

  issue                   text not null,
  urgency                 text not null,

  country                 text not null,
  state                   text not null,
  city                    text not null,
  postal_code             text not null,
  street                  text not null,
  unit                    text,

  first_name              text not null,
  last_name               text not null,
  phone                   text not null,
  email                   text not null,
  contact_method          text not null,

  description             text check (char_length(description) <= 2000),
  property_type           text not null,
  property_status         text not null,
  preferred_contact_time  text,

  referral_acknowledgment boolean not null check (referral_acknowledgment = true),
  marketing_consent       boolean not null default false
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

-- 2. Admin users ------------------------------------------------------------
-- Only users listed here can read or manage leads.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- 3. Row level security -----------------------------------------------------
alter table public.leads enable row level security;
alter table public.admin_users enable row level security;

-- The public form may INSERT leads (and nothing else).
drop policy if exists "Anyone can submit a lead" on public.leads;
create policy "Anyone can submit a lead"
  on public.leads for insert
  to anon, authenticated
  with check (status = 'new');

-- Admins can read and update leads.
drop policy if exists "Admins can read leads" on public.leads;
create policy "Admins can read leads"
  on public.leads for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update leads" on public.leads;
create policy "Admins can update leads"
  on public.leads for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A signed-in user can see only their own admin row (used by the login check).
drop policy if exists "Users can read own admin row" on public.admin_users;
create policy "Users can read own admin row"
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());

-- 4. Make yourself an admin -------------------------------------------------
-- First create the user: Dashboard > Authentication > Users > Add user (email + password,
-- tick "Auto Confirm User"). Then run this with that email:
--
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'team@digitallegendsagency.com'
-- on conflict do nothing;
