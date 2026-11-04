-- Run this ONLY AFTER the CAPTCHA is set up and the new site version is live (see README: "CAPTCHA"). Supabase: SQL Editor > Run.
-- Until now the public forms wrote straight into these tables from the browser, which lets a bot skip the CAPTCHA by calling the
-- database address directly. This closes that door: the forms now go through /api/submit/*, which checks the CAPTCHA and saves with the
-- server key. Signed-in contractors can still add their own business (their account passed the sign-up CAPTCHA). Safe to re-run.
-- To undo it, run schema.sql, schema-contact.sql and schema-directory.sql again (they recreate the public policies).

drop policy if exists "Anyone can submit a lead" on public.leads;
drop policy if exists "Anyone can send a contact message" on public.contact_messages;

drop policy if exists "Anyone can submit a listing" on public.listings;
drop policy if exists "Signed-in users can submit a listing" on public.listings;
create policy "Signed-in users can submit a listing" on public.listings for insert to authenticated with check (status = 'pending');

drop policy if exists "Anyone can add submitter details" on public.listing_private;
drop policy if exists "Signed-in users can add submitter details" on public.listing_private;
create policy "Signed-in users can add submitter details" on public.listing_private for insert to authenticated with check (admin_notes is null);
