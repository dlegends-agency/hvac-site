-- Run any time after schema.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- The AI Assistant for Featured contractors (chat bubble, email drafts, reports by email). The AI itself runs on the server (functions/api/assistant);
-- this only keeps a daily count per business so one account cannot run up the AI bill. Only the server (service role) uses it.

create table if not exists public.assistant_usage (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day        date not null default (now() at time zone 'utc')::date,
  uses       int  not null default 0,
  primary key (listing_id, day)
);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;

-- Counts one use for today and says whether it was allowed (false once the daily limit is reached). Atomic, so two quick requests cannot
-- both slip under the limit.
create or replace function public.assistant_use(p_listing uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare used int;
begin
  insert into public.assistant_usage (listing_id, day, uses) values (p_listing, (now() at time zone 'utc')::date, 1)
  on conflict (listing_id, day) do update set uses = public.assistant_usage.uses + 1
  returning uses into used;
  return used <= p_limit;
end $$;
revoke all on function public.assistant_use(uuid, int) from public, anon, authenticated;
grant execute on function public.assistant_use(uuid, int) to service_role;
