-- Run any time after schema.sql (needs public.is_admin()). Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- When the permits and government-bids scrapes run, set from Admin > Schedule. GitHub checks every 30 minutes and starts a scrape only when
-- its schedule says it is due (scripts/schedule). Times are Philippine time (UTC+8).
--   frequency  off | hourly | daily | weekly
--   hourly     runs every every_hours hours
--   daily      runs every day at hour:minute
--   weekly     runs every weekday (1 = Monday ... 7 = Sunday) at hour:minute
-- Only admins read or change it from the website; the scrape jobs use the service role key.

create table if not exists public.scrape_schedules (
  source        text primary key check (source in ('permits', 'bids')),
  frequency     text not null default 'daily' check (frequency in ('off', 'hourly', 'daily', 'weekly')),
  every_hours   int  not null default 1 check (every_hours between 1 and 24),
  weekday       int  not null default 1 check (weekday between 1 and 7),
  hour          int  not null default 8 check (hour between 0 and 23),
  minute        int  not null default 0 check (minute in (0, 30)),
  last_run_at   timestamptz,
  last_status   text check (last_status in ('success', 'failed', 'cancelled')),
  last_run_url  text,
  run_requested boolean not null default false,   -- "Run now" when GitHub cannot be started directly: the next check runs it
  updated_at    timestamptz not null default now()
);

-- The schedules that were fixed before this existed: every day, permits at 8:00 AM and bids at 8:30 AM Philippine time.
insert into public.scrape_schedules (source, frequency, hour, minute) values ('permits', 'daily', 8, 0), ('bids', 'daily', 8, 30)
on conflict (source) do nothing;

alter table public.scrape_schedules enable row level security;
revoke all on public.scrape_schedules from anon, authenticated;
grant select on public.scrape_schedules to authenticated;
-- Admins change only the settings and the "run now" flag; the run history is written by the scrape jobs.
grant update (frequency, every_hours, weekday, hour, minute, run_requested, updated_at) on public.scrape_schedules to authenticated;
drop policy if exists "Admins read scrape schedules" on public.scrape_schedules;
create policy "Admins read scrape schedules" on public.scrape_schedules for select to authenticated using (public.is_admin());
drop policy if exists "Admins change scrape schedules" on public.scrape_schedules;
create policy "Admins change scrape schedules" on public.scrape_schedules for update to authenticated using (public.is_admin()) with check (public.is_admin());
