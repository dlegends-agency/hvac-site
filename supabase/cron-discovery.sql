-- Schedules the discovery job and the 30-day cleanup. Run AFTER schema-discovery.sql AND after deploying the Edge Function
-- (see supabase/functions/discover-listings/README.md).
--
-- Before running: replace PUT_A_LONG_RANDOM_SECRET_HERE below with a long random string, and set the SAME value as the
-- Edge Function secret:   supabase secrets set CRON_SECRET=<that string>
-- Also check the project ref in the URL below matches your project.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the shared secret in Supabase Vault (not in plain SQL text afterwards).
select vault.create_secret('PUT_A_LONG_RANDOM_SECRET_HERE', 'discover_cron_secret')
where not exists (select 1 from vault.secrets where name = 'discover_cron_secret');

-- Run discovery every day at 09:00 UTC. The function only runs jobs that are due (daily/weekly) and enabled.
select cron.unschedule('discover-listings') where exists (select 1 from cron.job where jobname = 'discover-listings');
select cron.schedule(
  'discover-listings',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://pzjdtyszqboztatdfinb.supabase.co/functions/v1/discover-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'discover_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Delete candidates after 30 days (Google Places data must not be stored longer).
select cron.unschedule('purge-listing-candidates') where exists (select 1 from cron.job where jobname = 'purge-listing-candidates');
select cron.schedule(
  'purge-listing-candidates',
  '30 9 * * *',
  $$ delete from public.listing_candidates where fetched_at < now() - interval '30 days'; $$
);

-- Check the schedule:  select jobname, schedule, active from cron.job;
-- See recent runs:      select * from cron.job_run_details order by start_time desc limit 10;
