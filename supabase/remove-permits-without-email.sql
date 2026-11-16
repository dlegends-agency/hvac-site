-- Removes every saved permit and bid that has no contact with a name, a phone number AND an email address.
-- Run in the Supabase SQL Editor. Permits and bids that do have a full contact are kept. Safe to run again.

delete from public.public_permits p
where not exists (
  select 1 from jsonb_array_elements(coalesce(p.people, '[]'::jsonb)) x
  where coalesce(x->>'email', '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
    and length(regexp_replace(coalesce(x->>'phone', ''), '[^0-9]', '', 'g')) >= 10
    and coalesce(nullif(x->>'name', ''), nullif(x->>'company', '')) is not null
);

delete from public.gov_bids b
where not exists (
  select 1 from jsonb_array_elements(coalesce(b.contacts, '[]'::jsonb)) x
  where coalesce(x->>'email', '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
    and length(regexp_replace(coalesce(x->>'phone', ''), '[^0-9]', '', 'g')) >= 10
    and nullif(x->>'name', '') is not null
);

select
  (select count(*) from public.public_permits) as permits_left,
  (select count(*) from public.gov_bids) as bids_left;
