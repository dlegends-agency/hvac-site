-- Run AFTER schema-revamp.sql and schema-flow.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run. Existing rows are kept.
-- My Leads: one status for every unlocked lead (customer request, permit or bid), a follow-up date, an activity timeline and the
-- payment receipt of each unlock.
--   * lead_pipeline stays the single place a lead's status lives. Its stage list grows: new, follow_up, interested, converted.
--   * For customer requests, lead_assignments.contractor_status (used by messages, the admin flow log and the menu badge) is kept in
--     step with the pipeline stage in both directions, so the two can never disagree.
--   * lead_activities is the timeline: status changes, follow-ups, notes, calls and emails. Written only by the functions below.

-- 1. Stages and the follow-up date ---------------------------------------------------------------------
alter table public.lead_pipeline drop constraint if exists lead_pipeline_stage_check;
alter table public.lead_pipeline add constraint lead_pipeline_stage_check
  check (stage in ('saved', 'new', 'contacted', 'follow_up', 'interested', 'quoted', 'submitted', 'won', 'converted', 'lost'));
alter table public.lead_pipeline add column if not exists follow_up_on date;

-- 2. Timeline ------------------------------------------------------------------------------------------
create table if not exists public.lead_activities (
  id         bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  kind       text not null check (kind in ('lead', 'permit', 'bid')),
  item_id    uuid not null,
  type       text not null check (type in ('status', 'note', 'follow_up', 'call', 'email', 'unlock', 'converted')),
  body       text check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_item_idx on public.lead_activities (listing_id, kind, item_id, created_at desc);
alter table public.lead_activities enable row level security;
revoke all on public.lead_activities from anon, authenticated;
grant select on public.lead_activities to authenticated;
drop policy if exists "Owners read own activities" on public.lead_activities;
create policy "Owners read own activities" on public.lead_activities for select to authenticated
  using (exists (select 1 from public.listing_owners o where o.listing_id = lead_activities.listing_id and o.user_id = auth.uid()));
drop policy if exists "Admins read activities" on public.lead_activities;
create policy "Admins read activities" on public.lead_activities for select to authenticated using (public.is_admin());

-- 3. Stage <-> the older customer-request status ---------------------------------------------------------
create or replace function public.stage_status(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'saved' then 'new' when 'new' then 'new'
    when 'contacted' then 'contacted' when 'follow_up' then 'contacted' when 'interested' then 'contacted'
    when 'quoted' then 'contacted' when 'submitted' then 'contacted'
    when 'won' then 'won' when 'converted' then 'won'
    when 'lost' then 'lost'
  end;
$$;

create or replace function public.stage_label(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'saved' then 'New' when 'new' then 'New' when 'contacted' then 'Contacted' when 'follow_up' then 'Follow-up'
    when 'interested' then 'Interested' when 'quoted' then 'Quote sent' when 'submitted' then 'Bid submitted'
    when 'won' then 'Accepted' when 'converted' then 'Converted to project' when 'lost' then 'Lost'
    else p
  end;
$$;

-- A new pipeline row for a request already worked in the old way starts at that status instead of resetting it.
create or replace function public.trg_pipeline_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  if new.kind = 'lead' and new.stage = 'saved' then
    select a.contractor_status into s from public.lead_assignments a where a.lead_id = new.item_id and a.listing_id = new.listing_id;
    if s in ('contacted', 'won', 'lost') then new.stage := s; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists lead_pipeline_before on public.lead_pipeline;
create trigger lead_pipeline_before before insert on public.lead_pipeline for each row execute function public.trg_pipeline_before();

-- Timeline entries for status and follow-up changes, and the old status kept in step.
create or replace function public.trg_pipeline_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (listing_id, kind, item_id, type, body) values (new.listing_id, new.kind, new.item_id, 'status', 'Added to My Leads as ' || public.stage_label(new.stage));
  else
    if new.stage is distinct from old.stage then
      insert into public.lead_activities (listing_id, kind, item_id, type, body) values (new.listing_id, new.kind, new.item_id, 'status', 'Status: ' || public.stage_label(new.stage));
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
drop trigger if exists lead_pipeline_after on public.lead_pipeline;
create trigger lead_pipeline_after after insert or update on public.lead_pipeline for each row execute function public.trg_pipeline_after();

-- The other direction: the old status control on a request moves the pipeline stage.
create or replace function public.trg_assignment_to_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contractor_status is distinct from old.contractor_status then
    update public.lead_pipeline p
       set stage = case new.contractor_status when 'new' then 'new' else new.contractor_status end, updated_at = now()
     where p.listing_id = new.listing_id and p.kind = 'lead' and p.item_id = new.lead_id
       and public.stage_status(p.stage) is distinct from new.contractor_status;
  end if;
  return null;
end;
$$;
drop trigger if exists lead_assignments_to_pipeline on public.lead_assignments;
create trigger lead_assignments_to_pipeline after update of contractor_status on public.lead_assignments for each row execute function public.trg_assignment_to_pipeline();

-- 4. Notes, calls and emails on the timeline --------------------------------------------------------------
create or replace function public.add_lead_activity(p_kind text, p_item uuid, p_type text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_listing uuid;
begin
  if p_type not in ('note', 'call', 'email') then raise exception 'Invalid activity'; end if;
  select p.listing_id into v_listing
    from public.lead_pipeline p join public.listing_owners o on o.listing_id = p.listing_id
   where o.user_id = auth.uid() and p.kind = p_kind and p.item_id = p_item
   limit 1;
  if v_listing is null then raise exception 'Lead not found'; end if;
  if p_type = 'note' and coalesce(btrim(p_body), '') = '' then raise exception 'A note cannot be empty'; end if;
  insert into public.lead_activities (listing_id, kind, item_id, type, body) values (v_listing, p_kind, p_item, p_type, nullif(left(btrim(coalesce(p_body, '')), 2000), ''));
  update public.lead_pipeline set updated_at = now() where listing_id = v_listing and kind = p_kind and item_id = p_item;
end;
$$;

-- The timeline of one lead, for the signed-in owner only.
create or replace function public.my_lead_activities(p_kind text, p_item uuid)
returns table (created_at timestamptz, type text, body text)
language sql
security definer
set search_path = public
stable
as $$
  select a.created_at, a.type, a.body
    from public.lead_activities a
    join public.listing_owners o on o.listing_id = a.listing_id
   where o.user_id = auth.uid() and a.kind = p_kind and a.item_id = p_item
   order by a.id desc
   limit 200;
$$;

-- 5. Receipts: when, how much and which payment, for every unlock of the signed-in business ------------------------
create or replace function public.my_unlock_receipts()
returns table (kind text, item_id uuid, unlocked_at timestamptz, unlock_cents int, unlock_ref text)
language sql
security definer
set search_path = public
stable
as $$
  select 'lead'::text, a.lead_id, a.unlocked_at, a.unlock_cents, a.unlock_ref
    from public.lead_assignments a join public.listing_owners o on o.listing_id = a.listing_id
   where o.user_id = auth.uid() and a.unlocked_at is not null
  union all
  select u.kind, u.item_id, u.unlocked_at, u.unlock_cents, u.unlock_ref
    from public.opportunity_unlocks u join public.listing_owners o on o.listing_id = u.listing_id
   where o.user_id = auth.uid();
$$;

revoke all on function public.stage_status(text) from public, anon;
revoke all on function public.stage_label(text) from public, anon;
revoke all on function public.trg_pipeline_before() from public, anon, authenticated;
revoke all on function public.trg_pipeline_after() from public, anon, authenticated;
revoke all on function public.trg_assignment_to_pipeline() from public, anon, authenticated;
revoke all on function public.add_lead_activity(text, uuid, text, text) from public, anon;
revoke all on function public.my_lead_activities(text, uuid) from public, anon;
revoke all on function public.my_unlock_receipts() from public, anon;
grant execute on function public.add_lead_activity(text, uuid, text, text) to authenticated;
grant execute on function public.my_lead_activities(text, uuid) to authenticated;
grant execute on function public.my_unlock_receipts() to authenticated;
