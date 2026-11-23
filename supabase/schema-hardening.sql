-- Run LAST (after every other schema-*.sql). Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Launch hardening. Keeps the database in its locked state even when an older schema file is run again.
--   * The public forms (request a service, contact, add your business) go through /api/submit/*, which checks the CAPTCHA and saves with
--     the server key. These policies let a bot skip the CAPTCHA by writing to the tables directly, so they are removed.
--   * Signed-in contractors can still add their own business (their account passed the sign-up CAPTCHA), as a pending listing.
-- Run it only once the CAPTCHA is set up and the current site version is live (README: "CAPTCHA").

drop policy if exists "Anyone can submit a lead" on public.leads;
drop policy if exists "Anyone can send a contact message" on public.contact_messages;

drop policy if exists "Anyone can submit a listing" on public.listings;
drop policy if exists "Signed-in users can submit a listing" on public.listings;
create policy "Signed-in users can submit a listing" on public.listings for insert to authenticated with check (status = 'pending');

drop policy if exists "Anyone can add submitter details" on public.listing_private;
drop policy if exists "Signed-in users can add submitter details" on public.listing_private;
create policy "Signed-in users can add submitter details" on public.listing_private for insert to authenticated with check (admin_notes is null);

-- Trigger functions are only ever run by their triggers. Postgres refuses to run them by hand, but nobody needs the permission either.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- A business cannot give itself a Google rating or review count (these come from Google, set by server code or an admin).
create or replace function public.protect_ratings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.google_rating := null;
    new.google_review_count := null;
    new.google_reviews_url := null;
  else
    new.google_rating := old.google_rating;
    new.google_review_count := old.google_review_count;
    new.google_reviews_url := old.google_reviews_url;
  end if;
  return new;
end;
$$;
drop trigger if exists listings_protect_ratings on public.listings;
create trigger listings_protect_ratings before insert or update on public.listings for each row execute function public.protect_ratings();
revoke all on function public.protect_ratings() from public, anon, authenticated;
