-- Run AFTER schema-messages.sql and schema-bookings.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Listing analytics: how many visitors saw a business's listing, opened it and used it.
--   * listing_events holds one privacy-light row per thing a visitor did: saw the listing in a list (impression), opened its page (view),
--     or tapped Call, Email, Website or Directions. It stores a random per-browser id, the device class and the referrer host only:
--     no IP address, no user agent, no name. Nobody can read the table directly.
--   * Visitors write through track_listing_event (anyone, including signed-out). It ignores unknown listings and events, drops repeats
--     from the same browser inside a short window (a refresh is not a second view), and ignores the business's own signed-in owners.
--   * A business reads only its own numbers, through my_listing_analytics.

create table if not exists public.listing_events (
  id         bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  event      text not null check (event in ('impression', 'view', 'call', 'email', 'website', 'directions')),
  session_id text not null check (char_length(session_id) between 8 and 64),
  device     text check (device in ('desktop', 'mobile', 'tablet')),
  referrer   text check (char_length(referrer) <= 100),
  placement  text not null default 'other' check (placement in ('directory', 'city', 'home', 'similar', 'listing', 'other')),
  featured   boolean not null default false, -- was the listing on a paid plan when this happened
  created_at timestamptz not null default now()
);
create index if not exists listing_events_listing_idx on public.listing_events (listing_id, created_at desc);
create index if not exists listing_events_dedupe_idx on public.listing_events (listing_id, session_id, event, created_at desc);
alter table public.listing_events enable row level security; -- no policies: only the functions below touch it
revoke all on public.listing_events from anon, authenticated;

create or replace function public.track_listing_event(p_slug text, p_event text, p_session text, p_device text default null, p_ref text default null, p_placement text default 'other')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_window interval;
  v_place text := case when p_placement in ('directory', 'city', 'home', 'similar', 'listing') then p_placement else 'other' end;
begin
  if p_event not in ('impression', 'view', 'call', 'email', 'website', 'directions') then return; end if;
  if p_session is null or char_length(p_session) not between 8 and 64 then return; end if;
  select l.id into v_listing from public.listings l where l.slug = p_slug and l.status = 'published';
  if v_listing is null then return; end if;
  -- The business looking at its own listing is not a visitor.
  if auth.uid() is not null and exists (select 1 from public.listing_owners o where o.listing_id = v_listing and o.user_id = auth.uid()) then return; end if;
  v_window := case p_event when 'impression' then interval '1 hour' when 'view' then interval '30 minutes' else interval '1 minute' end;
  if exists (select 1 from public.listing_events e where e.listing_id = v_listing and e.session_id = p_session and e.event = p_event and e.created_at > now() - v_window
               and (p_event <> 'impression' or e.placement = v_place)) then return; end if;
  insert into public.listing_events (listing_id, event, session_id, device, referrer, placement, featured)
  values (v_listing, p_event, p_session, case when p_device in ('desktop', 'mobile', 'tablet') then p_device end, nullif(lower(left(btrim(coalesce(p_ref, '')), 100)), ''), v_place, public.listing_is_paid(v_listing));
end;
$$;

-- Everything the Analytics page shows, for the signed-in owner's listing, over the last p_days days and the same number of days before.
create or replace function public.my_listing_analytics(p_days int default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_listing uuid;
  v_days int := least(greatest(coalesce(p_days, 30), 7), 365);
  v_start timestamptz;
  v_prev timestamptz;
  v_totals jsonb; v_before jsonb; v_daily jsonb; v_devices jsonb; v_sources jsonb; v_places jsonb; v_leads jsonb;
begin
  select o.listing_id into v_listing from public.listing_owners o where o.user_id = auth.uid() order by o.listing_id limit 1;
  if v_listing is null then return null; end if;
  v_start := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev := v_start - make_interval(days => v_days);

  select jsonb_build_object(
           'impressions', count(*) filter (where event = 'impression'),
           'featured_impressions', count(*) filter (where event = 'impression' and featured),
           'views', count(*) filter (where event = 'view'),
           'visitors', count(distinct session_id) filter (where event = 'view'),
           'calls', count(*) filter (where event = 'call'),
           'emails', count(*) filter (where event = 'email'),
           'websites', count(*) filter (where event = 'website'),
           'directions', count(*) filter (where event = 'directions'))
    into v_totals from public.listing_events where listing_id = v_listing and created_at >= v_start;
  select jsonb_build_object(
           'impressions', count(*) filter (where event = 'impression'),
           'views', count(*) filter (where event = 'view'),
           'visitors', count(distinct session_id) filter (where event = 'view'),
           'actions', count(*) filter (where event in ('call', 'email', 'website', 'directions')))
    into v_before from public.listing_events where listing_id = v_listing and created_at >= v_prev and created_at < v_start;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'impressions', coalesce(c.i, 0), 'views', coalesce(c.v, 0), 'actions', coalesce(c.a, 0)) order by d), '[]'::jsonb)
    into v_daily
    from generate_series(v_start, date_trunc('day', now()), interval '1 day') d
    left join (select date_trunc('day', created_at) as day,
                      count(*) filter (where event = 'impression') as i, count(*) filter (where event = 'view') as v,
                      count(*) filter (where event in ('call', 'email', 'website', 'directions')) as a
                 from public.listing_events where listing_id = v_listing and created_at >= v_start group by 1) c on c.day = d;

  select coalesce(jsonb_object_agg(device, n), '{}'::jsonb) into v_devices
    from (select device, count(*) n from public.listing_events where listing_id = v_listing and created_at >= v_start and event = 'view' and device is not null group by 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc), '[]'::jsonb) into v_sources
    from (select coalesce(referrer, 'Direct or unknown') as name, count(*) n from public.listing_events where listing_id = v_listing and created_at >= v_start and event = 'view' group by 1 order by 2 desc limit 6) x;
  select coalesce(jsonb_object_agg(placement, n), '{}'::jsonb) into v_places
    from (select placement, count(*) n from public.listing_events where listing_id = v_listing and created_at >= v_start and event = 'impression' group by 1) x;

  select jsonb_build_object(
           'received', (select count(*) from public.lead_assignments a where a.listing_id = v_listing and a.assigned_at >= v_start),
           'received_before', (select count(*) from public.lead_assignments a where a.listing_id = v_listing and a.assigned_at >= v_prev and a.assigned_at < v_start))
    into v_leads;

  return jsonb_build_object('days', v_days, 'featured_now', public.listing_is_paid(v_listing), 'totals', v_totals, 'before', v_before,
                            'daily', v_daily, 'devices', v_devices, 'sources', v_sources, 'placements', v_places, 'leads', v_leads);
end;
$$;

revoke all on function public.track_listing_event(text, text, text, text, text, text) from public;
revoke all on function public.my_listing_analytics(int) from public, anon;
grant execute on function public.track_listing_event(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.my_listing_analytics(int) to authenticated;

-- Platform view for admins: how all listings are doing over the last p_days days (totals, featured against free, and the most viewed listings).
create or replace function public.admin_listing_analytics(p_days int default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 7), 365);
  v_start timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 30), 7), 365) - 1);
  v_totals jsonb; v_top jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select jsonb_build_object(
           'impressions', count(*) filter (where event = 'impression'),
           'featured_impressions', count(*) filter (where event = 'impression' and featured),
           'views', count(*) filter (where event = 'view'),
           'featured_views', count(*) filter (where event = 'view' and featured),
           'visitors', count(distinct session_id) filter (where event = 'view'),
           'actions', count(*) filter (where event in ('call', 'email', 'website', 'directions')),
           'featured_actions', count(*) filter (where event in ('call', 'email', 'website', 'directions') and featured),
           'listings_seen', count(distinct listing_id))
    into v_totals from public.listing_events where created_at >= v_start;
  select coalesce(jsonb_agg(t order by (t->>'views')::int desc), '[]'::jsonb) into v_top
    from (select jsonb_build_object('slug', l.slug, 'name', l.business_name, 'city', l.city, 'featured', public.listing_is_paid(l.id),
                 'impressions', count(*) filter (where e.event = 'impression'), 'views', count(*) filter (where e.event = 'view'),
                 'actions', count(*) filter (where e.event in ('call', 'email', 'website', 'directions'))) t
            from public.listing_events e join public.listings l on l.id = e.listing_id
           where e.created_at >= v_start group by l.id order by count(*) filter (where e.event = 'view') desc, count(*) desc limit 10) x;
  return jsonb_build_object('days', v_days, 'totals', v_totals, 'top', v_top);
end;
$$;
revoke all on function public.admin_listing_analytics(int) from public, anon;
grant execute on function public.admin_listing_analytics(int) to authenticated;
