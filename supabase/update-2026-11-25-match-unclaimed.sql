-- Match leads to UNCLAIMED listings too (imported vendors, scraped Google businesses). Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
--
-- Before: route_lead only sent a lead to listings with an approved owner, so every imported listing showed "no match".
-- Now: a lead is matched to up to 3 claimed businesses (as before) AND up to 3 unclaimed ones. An unclaimed match is HELD:
--   * it is recorded in lead_assignments (source 'auto'), so it shows in Admin > Directory > a listing > Leads and in the timeline;
--   * no email is queued and nobody is told, because there is no owner yet;
--   * the customer does not see it as "sent to" that business (my_requests hides unowned businesses);
--   * the claimed businesses still get their full 3 slots; unclaimed ones never take a slot from them;
--   * when an owner claim is approved, the held leads appear in that owner's My leads (locked until they unlock them).
-- Permits and bids already matched unclaimed listings by area (listing_reaches does not look at ownership); nothing changes there.

create or replace function public.route_lead(p_lead uuid, p_max int default 3)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads;
  v_lat double precision;
  v_lng double precision;
  v_have int;
  v_owned boolean;
  n int;
  total int := 0;
begin
  select * into l from public.leads where id = p_lead;
  if not found or l.status = 'spam' then
    return 0;
  end if;

  select z.lat, z.lng into v_lat, v_lng from public.zip_centroids z where z.zip = public.zip5(l.postal_code);

  -- Pass 1 fills the claimed businesses, pass 2 the unclaimed ones; each has its own limit.
  foreach v_owned in array array[true, false] loop
    select count(*)::int into v_have
      from public.lead_assignments x
     where x.lead_id = l.id
       and exists (select 1 from public.listing_owners o where o.listing_id = x.listing_id) = v_owned;
    if v_have >= p_max then
      continue;
    end if;

    insert into public.lead_assignments (lead_id, listing_id, source)
    select l.id, c.id, 'auto'
    from (
      select q.id
      from (
        select li.id, li.created_at, (li.plan = 'featured' and (li.plan_until is null or li.plan_until > now())) as is_paid, li.service_radius_miles as radius,
               (select max(a.assigned_at) from public.lead_assignments a where a.listing_id = li.id) as last_at,
               (public.norm_state(li.state) = public.norm_state(l.state) and (
                  lower(btrim(li.city)) = lower(btrim(l.city))
                  or (li.service_areas is not null
                      and li.service_areas ~* ('\m' || regexp_replace(btrim(l.city), '([^a-zA-Z0-9 ])', '\\\1', 'g') || '\M'))
                )) as is_local,
               case when v_lat is not null and z.lat is not null then public.miles_between(v_lat, v_lng, z.lat, z.lng) end as miles
        from public.listings li
        left join public.zip_centroids z on z.zip = public.zip5(li.postal_code)
        where li.status = 'published'
          and (exists (select 1 from public.listing_owners o where o.listing_id = li.id) = v_owned)
          and not exists (select 1 from public.lead_assignments ax where ax.lead_id = l.id and ax.listing_id = li.id)
      ) q
      where q.is_local or (q.miles is not null and q.miles <= q.radius)
      order by q.is_paid desc, q.is_local desc, q.last_at asc nulls first, q.miles asc nulls last, q.created_at
      limit greatest(p_max - v_have, 0)
    ) c
    on conflict do nothing;

    get diagnostics n = row_count;
    total := total + n;
  end loop;
  return total;
end;
$$;

-- No alert email for a held (unclaimed) match.
create or replace function public.queue_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.notification_settings;
begin
  begin
    if not exists (select 1 from public.listing_owners o where o.listing_id = new.listing_id) then
      return null;
    end if;
    insert into public.lead_notifications (lead_id, listing_id) values (new.lead_id, new.listing_id) on conflict do nothing;
    select * into cfg from public.notification_settings where id = 1;
    if cfg.endpoint is not null and cfg.secret is not null then
      begin
        execute 'select net.http_post(url := $1, headers := $2, body := $3)'
          using cfg.endpoint, jsonb_build_object('Content-Type', 'application/json', 'X-Notify-Secret', cfg.secret), '{"kick": true}'::jsonb;
      exception when others then
        null;
      end;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

-- Customers only see businesses that actually received their request (have an owner).
drop function if exists public.my_requests();
create or replace function public.my_requests()
returns table (
  id uuid, created_at timestamptz, issue text, urgency text, city text, state text, postal_code text, street text,
  description text, status text, businesses jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.created_at, l.issue, l.urgency, l.city, l.state, l.postal_code, l.street, l.description, l.status,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'listing_id', b.id, 'messages', (a.unlocked_at is not null),
                    'name', b.business_name, 'slug', b.slug, 'city', b.city, 'state', b.state, 'phone', b.phone,
                    'status', a.contractor_status, 'sent_at', a.assigned_at, 'contacted_at', a.contacted_at
                  ) order by a.assigned_at)
             from public.lead_assignments a
             join public.listings b on b.id = a.listing_id and b.status = 'published'
            where a.lead_id = l.id
              and exists (select 1 from public.listing_owners o where o.listing_id = a.listing_id)
         ), '[]'::jsonb)
  from public.leads l
  where l.status <> 'spam'
    and auth.uid() is not null
    and (
      l.customer_id = auth.uid()
      or lower(l.email) = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    )
  order by l.created_at desc;
$$;
revoke all on function public.my_requests() from public, anon;
grant execute on function public.my_requests() to authenticated;

-- Match the leads already received in the last 90 days to unclaimed listings (claimed businesses are not touched: their slots are full or already filled).
select coalesce(sum(n), 0) as new_matches from (
  select public.route_lead(id) as n from public.leads where status <> 'spam' and created_at > now() - interval '90 days'
) s;

-- Admin > a lead > "why did / didn't each business match": an unclaimed business now counts as a (held) match.
create or replace function public.admin_route_report(p_lead uuid)
returns table (
  listing_id uuid, business_name text, city text, state text, postal_code text, listing_status text,
  has_login boolean, miles int, radius int, matched boolean, reason text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  l public.leads;
  v_lat double precision;
  v_lng double precision;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  select * into l from public.leads where id = p_lead;
  if not found then
    return;
  end if;
  select z.lat, z.lng into v_lat, v_lng from public.zip_centroids z where z.zip = public.zip5(l.postal_code);

  return query
  with r as (
    select li.id, li.business_name as name, li.city as city, li.state as state, li.postal_code as zip, li.status as status,
           li.service_radius_miles as radius,
           exists (select 1 from public.listing_owners o where o.listing_id = li.id) as has_login,
           case when v_lat is not null and z.lat is not null then public.miles_between(v_lat, v_lng, z.lat, z.lng) end as miles,
           (public.norm_state(li.state) = public.norm_state(l.state) and (
              lower(btrim(li.city)) = lower(btrim(l.city))
              or (li.service_areas is not null
                  and li.service_areas ~* ('\m' || regexp_replace(btrim(l.city), '([^a-zA-Z0-9 ])', '\\\1', 'g') || '\M'))
            )) as is_local
    from public.listings li
    left join public.zip_centroids z on z.zip = public.zip5(li.postal_code)
  ), m as (
    select r.*, (r.status = 'published' and (r.is_local or (r.miles is not null and r.miles <= r.radius))) as ok from r
  )
  select m.id, m.name, m.city, m.state, m.zip, m.status, m.has_login, round(m.miles)::int, m.radius, m.ok,
         case
           when m.status <> 'published' then format('Not published yet (status: %s), so it gets no requests.', m.status)
           when m.is_local and not m.has_login then format('Matches (held): same city as the customer (%s). Unclaimed, so it is recorded but nobody is notified until an owner claims it.', l.city)
           when m.miles is not null and m.miles <= m.radius and not m.has_login then format('Matches (held): %s miles from the customer, within its %s-mile travel distance. Unclaimed, so nobody is notified until an owner claims it.', round(m.miles), m.radius)
           when m.is_local then format('Matches: same city as the customer (%s) or lists it as a service area.', l.city)
           when m.miles is not null and m.miles <= m.radius then format('Matches: %s miles from the customer, within its %s-mile travel distance.', round(m.miles), m.radius)
           when m.miles is not null then format('Too far: %s miles from the customer, but it travels only %s miles.', round(m.miles), m.radius)
           when public.norm_state(m.state) is distinct from public.norm_state(l.state) then
             format('Different state (the business is listed in %s, the customer is in %s) and no ZIP distance to compare. Check the business address: is the city or state typed correctly?', coalesce(nullif(btrim(m.state), ''), 'no state'), coalesce(nullif(btrim(l.state), ''), 'no state'))
           when public.zip5(m.zip) is null then 'Different city, and the business has no ZIP code, so distance cannot be checked. Add its ZIP code.'
           else 'Different city, and a ZIP code is not in the distance table, so distance cannot be checked.'
         end
  from m
  order by m.ok desc, m.miles asc nulls last, m.name
  limit 25;
end;
$fn$;
revoke all on function public.admin_route_report(uuid) from public, anon;
grant execute on function public.admin_route_report(uuid) to authenticated;
