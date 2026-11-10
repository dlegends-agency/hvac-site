-- UPDATE 2026-11-10: email addresses on discovery candidates. Paste into Supabase > SQL Editor > New query and press Run. Safe to run more than once.
-- Needs schema-discovery.sql to have been run before (it has, if Admin > Directory > Find businesses works).

-- 6. Email addresses found on business websites ----------------------------------------------
-- The agent reads the public contact email from a business's own website. Candidates carry it, and it is copied to the listing on import.
alter table public.listing_candidates add column if not exists email text check (char_length(email) <= 200);

-- Which businesses the email search has already looked at (so it does not visit the same site every run).
create table if not exists public.discovery_email_checks (
  ref        text primary key,                 -- "listing:<uuid>" or "candidate:<uuid>"
  checked_at timestamptz not null default now(),
  found      boolean not null default false
);
alter table public.discovery_email_checks enable row level security;
drop policy if exists "Admins read email checks" on public.discovery_email_checks;
create policy "Admins read email checks" on public.discovery_email_checks for select to authenticated using (public.is_admin());
