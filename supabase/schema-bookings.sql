-- Run AFTER schema-myleads.sql, schema-projects.sql and schema-bidprep.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Automatic lead status, status emails and the booking calendar.
--   1. The system moves a lead forward by itself, never backward, and never once it is Accepted, Converted or Lost:
--        a successful call, or an email the business sends        -> Contacted
--        a customer message (or a reply the business logs) that asks for a quotation, price or estimate -> Interested
--        the business sends a proposal, quotation, estimate or agreement (named in the subject)          -> Quote sent
--        a government bid workspace marked Submitted               -> Bid submitted
--      Each automatic move writes "Automatic: why" on the lead's timeline.
--   2. Every status change (by the contractor or the system) queues an email to the business owner (/api/notify/send sends it).
--   3. bookings: a calendar of site visits, estimates and jobs, linked to a lead and/or a project.

-- 1. Detection, in the database so every route in (messages, email, the buttons) behaves the same ---------------
create or replace function public.asks_for_quote(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(p) ~ '\m(quote|quotes|quotation|quotations|estimate|estimates|how much|price|prices|pricing|cost|costs|proposal|ballpark|bid)\M', false);
$$;

create or replace function public.is_quote_subject(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(lower(p) ~ '\m(proposal|quotation|quote|estimate|agreement|contract|bid)\M', false);
$$;

create or replace function public.stage_rank(p text)
returns int
language sql
immutable
as $$
  select case p when 'saved' then 0 when 'new' then 0 when 'contacted' then 1 when 'follow_up' then 1 when 'interested' then 2 when 'quoted' then 3 when 'submitted' then 4 else 9 end;
$$;

-- 2. Status emails: a queue, drained by /api/notify/send -------------------------------------------------------------
create table if not exists public.status_alerts (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind       text not null,
  item_id    uuid not null,
  title      text,
  from_stage text,
  to_stage   text not null,
  reason     text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at    timestamptz,
  attempts   int not null default 0,
  last_error text
);
create index if not exists status_alerts_pending_idx on public.status_alerts (created_at) where sent_at is null;
alter table public.status_alerts enable row level security; -- no policies: only the functions below touch it

create or replace function public.queue_status_alert(p_listing uuid, p_kind text, p_item uuid, p_title text, p_from text, p_to text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cfg public.notification_settings;
begin
  begin
    insert into public.status_alerts (listing_id, kind, item_id, title, from_stage, to_stage, reason) values (p_listing, p_kind, p_item, left(p_title, 300), p_from, p_to, left(p_reason, 300));
    select * into cfg from public.notification_settings where id = 1;
    if cfg.endpoint is not null and cfg.secret is not null then
      begin
        execute 'select net.http_post(url := $1, headers := $2, body := $3)'
          using cfg.endpoint, jsonb_build_object('Content-Type', 'application/json', 'X-Notify-Secret', cfg.secret), '{"kick": true}'::jsonb;
      exception when others then null; -- the scheduled flush will send it
      end;
    end if;
  exception when others then null; -- never block a status change
  end;
end;
$$;

-- The pipeline trigger from schema-myleads.sql, now also queuing the email.
create or replace function public.trg_pipeline_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_reason text := nullif(current_setting('app.status_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (listing_id, kind, item_id, type, body) values (new.listing_id, new.kind, new.item_id, 'status', 'Added to My Leads as ' || public.stage_label(new.stage));
  else
    if new.stage is distinct from old.stage then
      insert into public.lead_activities (listing_id, kind, item_id, type, body) values (new.listing_id, new.kind, new.item_id, 'status', 'Status: ' || public.stage_label(new.stage));
      perform public.queue_status_alert(new.listing_id, new.kind, new.item_id, new.title, old.stage, new.stage, v_reason);
      if new.kind = 'lead' then
        update public.lead_assignments a
           set contractor_status = public.stage_status(new.stage),
               contacted_at = case when public.stage_status(new.stage) = 'new' then null else coalesce(a.contacted_at, now()) end
         where a.lead_id = new.item_id and a.listing_id = new.listing_id and a.contractor_status is distinct from public.stage_status(new.stage);
      end if;
    end if;
    if new.follow_up_on is distinct from old.follow_up_on and new.follow_up_on is not null then
      insert into public.lead_activities (listing_id, kind, item_id, type, body) values (new.listing_id, new.kind, new.item_id, 'follow_up', 'Follow-up set for ' || to_char(new.follow_up_on, 'Mon DD, YYYY'));
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.claim_status_alerts(p_limit int default 20)
returns table (id uuid, email text, business_name text, title text, kind text, from_label text, to_label text, reason text)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.status_alerts n set sent_at = now(), last_error = 'alerts switched off'
    from public.listing_owners o
   where o.listing_id = n.listing_id and not o.notify_email and n.sent_at is null;
  return query
  with picked as (
    select n.id from public.status_alerts n
     where n.sent_at is null and n.attempts < 5 and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
     order by n.created_at limit greatest(p_limit, 0) for update skip locked
  ), marked as (
    update public.status_alerts n set attempts = n.attempts + 1, claimed_at = now() from picked where n.id = picked.id
    returning n.id, n.listing_id, n.title, n.kind, n.from_stage, n.to_stage, n.reason
  )
  select m.id, u.email::text, li.business_name, m.title, m.kind, public.stage_label(m.from_stage), public.stage_label(m.to_stage), m.reason
    from marked m
    join public.listings li on li.id = m.listing_id
    join public.listing_owners o on o.listing_id = m.listing_id
    join auth.users u on u.id = o.user_id;
end;
$$;

create or replace function public.finish_status_alerts(p_sent uuid[], p_failed jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.status_alerts set sent_at = now(), last_error = null where id = any (coalesce(p_sent, '{}'));
  update public.status_alerts n set last_error = left(f.value, 300), claimed_at = null
    from jsonb_each_text(coalesce(p_failed, '{}'::jsonb)) f
   where n.id::text = f.key;
end;
$$;

-- 3. Moving a lead forward by itself --------------------------------------------------------------------------------
-- Only forward, never out of Accepted / Converted / Lost. Adds the lead to My Leads first when it is unlocked but not there yet.
create or replace function public.auto_advance(p_listing uuid, p_kind text, p_item uuid, p_to text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_stage text; v_title text; v_place text;
begin
  select stage into v_stage from public.lead_pipeline where listing_id = p_listing and kind = p_kind and item_id = p_item;
  if not found then
    if p_kind = 'lead' and exists (select 1 from public.lead_assignments a where a.lead_id = p_item and a.listing_id = p_listing and a.unlocked_at is not null) then
      select coalesce(l.issue, 'Customer request'), nullif(concat_ws(', ', l.city, l.state), '') into v_title, v_place from public.leads l where l.id = p_item;
    elsif p_kind = 'permit' and exists (select 1 from public.opportunity_unlocks u where u.listing_id = p_listing and u.kind = 'permit' and u.item_id = p_item) then
      select coalesce(nullif(p.summary, ''), 'Building permit'), p.city into v_title, v_place from public.public_permits p where p.id = p_item;
    elsif p_kind = 'bid' and exists (select 1 from public.opportunity_unlocks u where u.listing_id = p_listing and u.kind = 'bid' and u.item_id = p_item) then
      select b.title, nullif(concat_ws(', ', b.city, b.state), '') into v_title, v_place from public.gov_bids b where b.id = p_item;
    else
      return false;
    end if;
    insert into public.lead_pipeline (listing_id, kind, item_id, title, place) values (p_listing, p_kind, p_item, left(coalesce(v_title, 'Opportunity'), 300), left(v_place, 200)) on conflict do nothing;
    select stage into v_stage from public.lead_pipeline where listing_id = p_listing and kind = p_kind and item_id = p_item;
  end if;
  if v_stage in ('won', 'converted', 'lost') or public.stage_rank(v_stage) >= public.stage_rank(p_to) then return false; end if;
  perform set_config('app.status_reason', p_reason, true);
  update public.lead_pipeline set stage = p_to, updated_at = now() where listing_id = p_listing and kind = p_kind and item_id = p_item;
  perform set_config('app.status_reason', '', true);
  insert into public.lead_activities (listing_id, kind, item_id, type, body) values (p_listing, p_kind, p_item, 'status', 'Automatic: ' || p_reason);
  return true;
end;
$$;

-- Messages in a customer thread (written by the site's own functions): the business writing = Contacted (Quote sent when the subject
-- names a proposal or quotation); the customer asking about price = Interested.
create or replace function public.trg_message_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender = 'business' then
    perform public.auto_advance(new.listing_id, 'lead', new.lead_id, 'contacted', 'you emailed the customer');
    if public.is_quote_subject(new.subject) then perform public.auto_advance(new.listing_id, 'lead', new.lead_id, 'quoted', 'you sent a proposal or quotation'); end if;
  elsif new.sender = 'customer' and public.asks_for_quote(new.body) then
    perform public.auto_advance(new.listing_id, 'lead', new.lead_id, 'interested', 'the customer asked for a quotation');
  end if;
  return null;
end;
$$;
drop trigger if exists lead_messages_status on public.lead_messages;
create trigger lead_messages_status after insert on public.lead_messages for each row execute function public.trg_message_status();

-- An email the site sent for a business to the contact on a permit or bid.
create or replace function public.log_opportunity_email(p_listing uuid, p_kind text, p_item uuid, p_to text, p_subject text, p_body text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.opportunity_emails (listing_id, kind, item_id, to_email, subject, body, error)
  values (p_listing, p_kind, p_item, lower(p_to), left(p_subject, 200), left(p_body, 4000), left(p_error, 300));
  if p_error is null then
    perform public.auto_advance(p_listing, p_kind, p_item, 'contacted', 'you emailed the contact');
    if public.is_quote_subject(p_subject) then perform public.auto_advance(p_listing, p_kind, p_item, 'quoted', 'you sent a proposal or quotation'); end if;
  end if;
end;
$$;

-- A bid workspace marked Submitted moves the bid in My Leads to Bid submitted.
create or replace function public.trg_bid_submitted_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' and new.gov_bid_id is not null then
    perform public.auto_advance(new.listing_id, 'bid', new.gov_bid_id, 'submitted', 'you marked the bid as submitted');
  end if;
  return null;
end;
$$;
drop trigger if exists bid_workspaces_submitted_status on public.bid_workspaces;
create trigger bid_workspaces_submitted_status after update of status on public.bid_workspaces for each row execute function public.trg_bid_submitted_status();

-- The contractor says how a call went. Only a call that connected moves the lead to Contacted.
create or replace function public.log_call(p_kind text, p_item uuid, p_outcome text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_listing uuid;
begin
  if p_outcome not in ('connected', 'no_answer', 'voicemail') then raise exception 'Invalid call outcome'; end if;
  select p.listing_id into v_listing
    from public.lead_pipeline p join public.listing_owners o on o.listing_id = p.listing_id
   where o.user_id = auth.uid() and p.kind = p_kind and p.item_id = p_item limit 1;
  if v_listing is null then raise exception 'Lead not found'; end if;
  insert into public.lead_activities (listing_id, kind, item_id, type, body)
  values (v_listing, p_kind, p_item, 'call', concat(case p_outcome when 'connected' then 'Call: spoke with them' when 'voicemail' then 'Call: left a voicemail' else 'Call: no answer' end, case when nullif(btrim(p_note), '') is not null then ' - ' || left(btrim(p_note), 500) end));
  if p_outcome = 'connected' then return public.auto_advance(v_listing, p_kind, p_item, 'contacted', 'you had a successful call'); end if;
  update public.lead_pipeline set updated_at = now() where listing_id = v_listing and kind = p_kind and item_id = p_item;
  return false;
end;
$$;

-- The contractor logs a reply they received by email (a bid officer, a permit contractor, or a customer who wrote to their own inbox).
-- Returns true when it asked for a quotation and the lead moved to Interested.
create or replace function public.log_inbound_reply(p_kind text, p_item uuid, p_body text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_listing uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) not between 1 and 4000 then raise exception 'A reply is 1 to 4000 characters'; end if;
  select p.listing_id into v_listing
    from public.lead_pipeline p join public.listing_owners o on o.listing_id = p.listing_id
   where o.user_id = auth.uid() and p.kind = p_kind and p.item_id = p_item limit 1;
  if v_listing is null then raise exception 'Lead not found'; end if;
  insert into public.lead_activities (listing_id, kind, item_id, type, body) values (v_listing, p_kind, p_item, 'email', 'Reply received: ' || left(v_body, 500));
  if public.asks_for_quote(v_body) then return public.auto_advance(v_listing, p_kind, p_item, 'interested', 'they asked for a quotation'); end if;
  update public.lead_pipeline set updated_at = now() where listing_id = v_listing and kind = p_kind and item_id = p_item;
  return false;
end;
$$;

-- 4. Bookings ---------------------------------------------------------------------------------------------------------
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  lead_kind     text check (lead_kind in ('lead', 'permit', 'bid')),
  lead_item_id  uuid,
  type          text not null default 'site_visit' check (type in ('site_visit', 'estimate', 'installation', 'service', 'inspection', 'meeting', 'other')),
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  customer_name text check (char_length(customer_name) <= 200),
  location      text check (char_length(location) <= 300),
  notes         text check (char_length(notes) <= 2000),
  status        text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '14 days'),
  check ((lead_kind is null) = (lead_item_id is null))
);
create index if not exists bookings_listing_idx on public.bookings (listing_id, starts_at);
create index if not exists bookings_project_idx on public.bookings (project_id) where project_id is not null;
alter table public.bookings enable row level security;
revoke all on public.bookings from anon, authenticated;
grant select, insert, delete on public.bookings to authenticated;
grant update (type, title, starts_at, ends_at, customer_name, location, notes, status, project_id) on public.bookings to authenticated;
drop policy if exists "Owners manage own bookings" on public.bookings;
create policy "Owners manage own bookings" on public.bookings for all to authenticated
  using (public.owns_listing(listing_id))
  with check (
    public.owns_listing(listing_id)
    and (project_id is null or public.owns_project(project_id))
    and (lead_kind is null or exists (select 1 from public.lead_pipeline p where p.listing_id = bookings.listing_id and p.kind = bookings.lead_kind and p.item_id = bookings.lead_item_id))
  );

create or replace function public.trg_bookings_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_what text;
begin
  if tg_op = 'INSERT' then v_what := 'Booking scheduled: ' || new.title;
  elsif new.status is distinct from old.status then v_what := 'Booking ' || new.status || ': ' || new.title;
  else
    new.updated_at := now();
    return new;
  end if;
  if new.lead_kind is not null then
    insert into public.lead_activities (listing_id, kind, item_id, type, body) values (new.listing_id, new.lead_kind, new.lead_item_id, 'note', v_what);
  end if;
  if new.project_id is not null then
    insert into public.project_activities (project_id, type, body) values (new.project_id, 'note', v_what);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists bookings_logged on public.bookings;
create trigger bookings_logged before insert or update on public.bookings for each row execute function public.trg_bookings_logged();

-- Grants ---------------------------------------------------------------------------------------------------------------
revoke all on function public.asks_for_quote(text), public.is_quote_subject(text), public.stage_rank(text) from public, anon;
revoke all on function public.queue_status_alert(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.trg_pipeline_after() from public, anon, authenticated;
revoke all on function public.claim_status_alerts(int) from public, anon, authenticated;
revoke all on function public.finish_status_alerts(uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.auto_advance(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.trg_message_status() from public, anon, authenticated;
revoke all on function public.trg_bid_submitted_status() from public, anon, authenticated;
revoke all on function public.trg_bookings_logged() from public, anon, authenticated;
revoke all on function public.log_opportunity_email(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.log_call(text, uuid, text, text) from public, anon;
revoke all on function public.log_inbound_reply(text, uuid, text) from public, anon;
grant execute on function public.claim_status_alerts(int), public.finish_status_alerts(uuid[], jsonb) to service_role;
grant execute on function public.log_opportunity_email(uuid, text, uuid, text, text, text, text) to service_role;
grant execute on function public.log_call(text, uuid, text, text) to authenticated;
grant execute on function public.log_inbound_reply(text, uuid, text) to authenticated;
