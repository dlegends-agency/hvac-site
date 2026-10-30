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

-- Contractors never get direct access to the leads table (it holds admin notes and every lead).
-- They read only the leads assigned to their own listing, and only the fields they need, through these functions.
create or replace function public.my_leads()
returns table (
  id uuid, created_at timestamptz, assigned_at timestamptz, issue text, urgency text, city text, state text, postal_code text,
  street text, unit text, first_name text, last_name text, phone text, email text, contact_method text, description text,
  property_type text, property_status text, preferred_contact_time text, contractor_status text, contractor_notes text
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.created_at, l.assigned_at, l.issue, l.urgency, l.city, l.state, l.postal_code,
         l.street, l.unit, l.first_name, l.last_name, l.phone, l.email, l.contact_method, l.description,
         l.property_type, l.property_status, l.preferred_contact_time, l.contractor_status, l.contractor_notes
  from public.leads l
  join public.listing_owners o on o.listing_id = l.assigned_listing_id
  where o.user_id = auth.uid() and l.status <> 'spam'
  order by l.assigned_at desc nulls last, l.created_at desc;
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
  update public.leads l
     set contractor_status = p_status, contractor_notes = nullif(left(p_notes, 2000), '')
   where l.id = p_id
     and exists (select 1 from public.listing_owners o where o.listing_id = l.assigned_listing_id and o.user_id = auth.uid());
  if not found then
    raise exception 'Lead not found';
  end if;
end;
$$;

revoke all on function public.my_leads() from public, anon;
revoke all on function public.update_my_lead(uuid, text, text) from public, anon;
grant execute on function public.my_leads() to authenticated;
grant execute on function public.update_my_lead(uuid, text, text) to authenticated;
