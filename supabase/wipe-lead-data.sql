-- Removes all scraped lead data so the scrapes can be run again from zero.
-- Run in the Supabase SQL Editor. It deletes: every government bid (gov_bids), every building permit (public_permits), and the
-- remembered "no email found" answers (so the next scrape tries those contractors again). Emails that WERE found are kept.
-- It does not touch your directory listings, contractors, customers or requests.

delete from public.gov_bids;
delete from public.public_permits;
delete from public.contractor_contacts where found is not true;

select
  (select count(*) from public.gov_bids) as gov_bids_left,
  (select count(*) from public.public_permits) as permits_left,
  (select count(*) from public.contractor_contacts) as remembered_emails_kept;
