-- Run AFTER schema-projects.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run. Existing records are kept.
-- Bid Preparation: a workspace for each government solicitation a business is going after.
--   bid_workspaces      the bid: its deadline, status (10 steps), the AI's reading of the solicitation
--   bid_documents       the solicitation papers (RFP, RFQ, ITB, specifications, drawings...): their text, or a link
--   bid_requirements    the compliance checklist: each requirement, whether it is mandatory, and verified / missing / needs update / manual
--   bid_estimate_lines  the cost worksheet (labor, materials, equipment, other)
--   bid_proposals       versions of the proposal; a person approves one, never the AI
--   bid_activities      the timeline
-- Rules enforced here, not in the browser:
--   * a bid can be marked Approved or Submitted only with an approved proposal AND every mandatory requirement verified,
--     however good the AI's match looked; the AI cannot approve anything (approval is a function that needs the signed-in owner);
--   * only a Submitted bid can be Awarded, and an Awarded bid converts to a project once (convert_bid_to_project);
--   * a workspace for a bid from the site can only be started for a bid the business has unlocked.
-- Every table is private to the business that owns it.

create table if not exists public.bid_workspaces (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references public.listings (id) on delete cascade,
  gov_bid_id          uuid references public.gov_bids (id) on delete set null,
  title               text not null check (char_length(title) between 1 and 300),
  agency              text check (char_length(agency) <= 200),
  solicitation_number text check (char_length(solicitation_number) <= 120),
  location            text check (char_length(location) <= 300),
  source              text check (char_length(source) <= 120),
  contract_value      numeric(14, 2) check (contract_value >= 0),
  due_at              timestamptz,
  status              text not null default 'new' check (status in ('new', 'under_review', 'qualified', 'preparing_bid', 'internal_review', 'approved', 'submitted', 'awarded', 'lost', 'expired')),
  analysis            jsonb,
  analyzed_at         timestamptz,
  source_hash         text,
  notes               text check (char_length(notes) <= 4000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists bid_workspaces_listing_idx on public.bid_workspaces (listing_id, updated_at desc);
create unique index if not exists bid_workspaces_bid_uniq on public.bid_workspaces (listing_id, gov_bid_id) where gov_bid_id is not null;

create table if not exists public.bid_documents (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.bid_workspaces (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  doc_type       text not null default 'Other' check (doc_type in ('RFP', 'RFQ', 'ITB', 'Solicitation', 'Specification', 'Drawing', 'Attachment', 'Other')),
  url            text check (url is null or (url ~* '^https?://' and char_length(url) <= 1000)),
  extracted_text text check (char_length(extracted_text) <= 120000),
  created_at     timestamptz not null default now()
);
create table if not exists public.bid_requirements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.bid_workspaces (id) on delete cascade,
  category     text not null default 'other' check (category in ('qualification', 'license', 'insurance', 'certification', 'bonding', 'attachment', 'evaluation', 'technical', 'other')),
  text         text not null check (char_length(text) between 1 and 600),
  mandatory    boolean not null default true,
  status       text not null default 'manual' check (status in ('verified', 'missing', 'needs_update', 'manual')),
  evidence     text check (char_length(evidence) <= 600),
  source       text not null default 'manual' check (source in ('ai', 'manual')),
  created_at   timestamptz not null default now()
);
create table if not exists public.bid_estimate_lines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.bid_workspaces (id) on delete cascade,
  kind         text not null default 'labor' check (kind in ('labor', 'material', 'equipment', 'other')),
  description  text not null check (char_length(description) between 1 and 300),
  quantity     numeric(12, 2) not null default 1 check (quantity >= 0),
  unit         text check (char_length(unit) <= 30),
  unit_cost    numeric(14, 2) not null default 0 check (unit_cost >= 0),
  created_at   timestamptz not null default now()
);
create table if not exists public.bid_proposals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.bid_workspaces (id) on delete cascade,
  version      int not null,
  title        text not null default 'Proposal' check (char_length(title) between 1 and 200),
  sections     jsonb not null default '[]'::jsonb,
  status       text not null default 'draft' check (status in ('draft', 'internal_review', 'approved')),
  by_ai        boolean not null default false,
  review_notes text check (char_length(review_notes) <= 6000),
  approved_at  timestamptz,
  approved_by  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, version)
);
create table if not exists public.bid_activities (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.bid_workspaces (id) on delete cascade,
  type         text not null check (type in ('created', 'status', 'note', 'document', 'analysis', 'requirement', 'proposal', 'estimate', 'amendment', 'converted')),
  body         text check (char_length(body) <= 2000),
  created_at   timestamptz not null default now()
);
create index if not exists bid_activities_idx on public.bid_activities (workspace_id, id desc);
create index if not exists bid_documents_idx on public.bid_documents (workspace_id);
create index if not exists bid_requirements_idx on public.bid_requirements (workspace_id);
create index if not exists bid_estimate_idx on public.bid_estimate_lines (workspace_id);
create index if not exists bid_proposals_idx on public.bid_proposals (workspace_id, version desc);

-- A project can come from a bid workspace, once.
alter table public.projects add column if not exists bid_workspace_id uuid references public.bid_workspaces (id) on delete set null;
create unique index if not exists projects_bid_ws_uniq on public.projects (bid_workspace_id) where bid_workspace_id is not null;

-- Access -----------------------------------------------------------------------------------------------
create or replace function public.owns_bid(p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bid_workspaces w join public.listing_owners o on o.listing_id = w.listing_id where w.id = p_ws and o.user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['bid_workspaces', 'bid_documents', 'bid_requirements', 'bid_estimate_lines', 'bid_proposals', 'bid_activities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.bid_workspaces, public.bid_proposals, public.bid_activities to authenticated;
grant insert, delete on public.bid_workspaces to authenticated;
-- An owner edits the bid's details and status (the status rules are in the trigger below), never who owns it or which notice it came from.
grant update (title, agency, solicitation_number, location, source, contract_value, due_at, status, analysis, analyzed_at, notes) on public.bid_workspaces to authenticated;
grant select, insert, update, delete on public.bid_documents, public.bid_requirements, public.bid_estimate_lines to authenticated;
-- Proposals are made by new_bid_proposal and approved by set_bid_proposal_status; an owner edits only the words.
grant update (title, sections, review_notes) on public.bid_proposals to authenticated;
grant delete on public.bid_proposals to authenticated;
grant insert on public.bid_activities to authenticated;

drop policy if exists "Owners read bids" on public.bid_workspaces;
create policy "Owners read bids" on public.bid_workspaces for select to authenticated using (public.owns_listing(listing_id));
drop policy if exists "Admins read bids" on public.bid_workspaces;
create policy "Admins read bids" on public.bid_workspaces for select to authenticated using (public.is_admin());
-- A workspace for a notice from the site is made by start_bid_workspace, which checks the notice is unlocked. By hand: no notice link.
drop policy if exists "Owners add manual bids" on public.bid_workspaces;
create policy "Owners add manual bids" on public.bid_workspaces for insert to authenticated with check (public.owns_listing(listing_id) and gov_bid_id is null and status = 'new');
drop policy if exists "Owners edit bids" on public.bid_workspaces;
create policy "Owners edit bids" on public.bid_workspaces for update to authenticated using (public.owns_listing(listing_id)) with check (public.owns_listing(listing_id));
drop policy if exists "Owners delete bids" on public.bid_workspaces;
create policy "Owners delete bids" on public.bid_workspaces for delete to authenticated
  using (public.owns_listing(listing_id) and status in ('new', 'under_review', 'qualified', 'preparing_bid', 'expired', 'lost'));

do $$
declare t text;
begin
  foreach t in array array['bid_documents', 'bid_requirements', 'bid_estimate_lines'] loop
    execute format('drop policy if exists "Owners manage rows" on public.%I', t);
    execute format('create policy "Owners manage rows" on public.%I for all to authenticated using (public.owns_bid(workspace_id)) with check (public.owns_bid(workspace_id))', t);
  end loop;
end $$;
drop policy if exists "Owners read proposals" on public.bid_proposals;
create policy "Owners read proposals" on public.bid_proposals for select to authenticated using (public.owns_bid(workspace_id));
drop policy if exists "Owners edit proposal words" on public.bid_proposals;
create policy "Owners edit proposal words" on public.bid_proposals for update to authenticated using (public.owns_bid(workspace_id)) with check (public.owns_bid(workspace_id));
drop policy if exists "Owners delete drafts" on public.bid_proposals;
create policy "Owners delete drafts" on public.bid_proposals for delete to authenticated using (public.owns_bid(workspace_id) and status <> 'approved');
drop policy if exists "Owners read bid timeline" on public.bid_activities;
create policy "Owners read bid timeline" on public.bid_activities for select to authenticated using (public.owns_bid(workspace_id));
drop policy if exists "Owners add bid notes" on public.bid_activities;
create policy "Owners add bid notes" on public.bid_activities for insert to authenticated with check (type = 'note' and public.owns_bid(workspace_id));

-- The rules ------------------------------------------------------------------------------------------------
create or replace function public.log_bid(p_ws uuid, p_type text, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.bid_activities (workspace_id, type, body) values (p_ws, p_type, left(p_body, 2000));
$$;

-- Mandatory requirements that are not yet verified. Anything above zero blocks approval and submission.
create or replace function public.bid_blockers(p_ws uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.bid_requirements r where r.workspace_id = p_ws and r.mandatory and r.status <> 'verified';
$$;

create or replace function public.trg_bid_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists bid_workspaces_touch on public.bid_workspaces;
create trigger bid_workspaces_touch before update on public.bid_workspaces for each row execute function public.trg_bid_touch();
drop trigger if exists bid_proposals_touch on public.bid_proposals;
create trigger bid_proposals_touch before update on public.bid_proposals for each row execute function public.trg_bid_touch();

create or replace function public.trg_bid_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('approved', 'submitted') then
      if not exists (select 1 from public.bid_proposals p where p.workspace_id = new.id and p.status = 'approved') then
        raise exception 'Approve a proposal first';
      end if;
      if public.bid_blockers(new.id) > 0 then
        raise exception 'Every mandatory requirement must be verified first (% left)', public.bid_blockers(new.id);
      end if;
    end if;
    if new.status = 'awarded' and old.status <> 'submitted' then raise exception 'Only a submitted bid can be awarded'; end if;
    if old.status = 'awarded' then raise exception 'An awarded bid cannot change status'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists bid_workspaces_guard on public.bid_workspaces;
create trigger bid_workspaces_guard before update on public.bid_workspaces for each row execute function public.trg_bid_guard();

create or replace function public.trg_bid_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_bid(new.id, 'created', 'Bid workspace started');
  elsif new.status is distinct from old.status then
    perform public.log_bid(new.id, 'status', 'Status: ' || initcap(replace(new.status, '_', ' ')));
  end if;
  if tg_op = 'UPDATE' and new.analyzed_at is distinct from old.analyzed_at and new.analyzed_at is not null then
    perform public.log_bid(new.id, 'analysis', 'Solicitation analysed');
  end if;
  return null;
end;
$$;
drop trigger if exists bid_workspaces_logged on public.bid_workspaces;
create trigger bid_workspaces_logged after insert or update on public.bid_workspaces for each row execute function public.trg_bid_logged();

create or replace function public.trg_bid_children_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_ws uuid; v_status text; v_blockers int;
begin
  v_ws := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  if tg_op = 'DELETE' then
    -- Nothing to record; a deleted row may belong to a workspace that is itself being deleted.
    null;
  elsif tg_table_name = 'bid_documents' and tg_op = 'INSERT' then perform public.log_bid(v_ws, 'document', 'Document added: ' || new.name || ' (' || new.doc_type || ')');
  elsif tg_table_name = 'bid_estimate_lines' and tg_op = 'INSERT' then perform public.log_bid(v_ws, 'estimate', 'Estimate line added: ' || new.description);
  elsif tg_table_name = 'bid_requirements' then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then perform public.log_bid(v_ws, 'requirement', 'Requirement marked ' || replace(new.status, '_', ' ') || ': ' || left(new.text, 120)); end if;
    -- An approved bid whose checklist is no longer clean goes back to internal review, with its proposal.
    select w.status into v_status from public.bid_workspaces w where w.id = v_ws;
    if v_status = 'approved' and public.bid_blockers(v_ws) > 0 then
      update public.bid_proposals set status = 'internal_review', approved_at = null, approved_by = null where workspace_id = v_ws and status = 'approved';
      update public.bid_workspaces set status = 'internal_review' where id = v_ws;
      perform public.log_bid(v_ws, 'requirement', 'Approval withdrawn: a mandatory requirement is no longer verified');
    end if;
  end if;
  return null;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['bid_documents', 'bid_requirements', 'bid_estimate_lines'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_logged', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_bid_children_logged()', t || '_logged', t);
  end loop;
end $$;

-- Changing the words of an approved proposal withdraws the approval.
create or replace function public.trg_proposal_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'approved' and (new.sections is distinct from old.sections or new.title is distinct from old.title) then
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by := null;
    update public.bid_workspaces set status = 'preparing_bid' where id = new.workspace_id and status = 'approved';
    perform public.log_bid(new.workspace_id, 'proposal', 'Approval withdrawn: the proposal was edited');
  end if;
  return new;
end;
$$;
drop trigger if exists bid_proposals_edit on public.bid_proposals;
create trigger bid_proposals_edit before update on public.bid_proposals for each row execute function public.trg_proposal_edit();

-- A new proposal version (a person's own draft, or one the AI wrote that the person chose to keep). Always starts as a draft.
create or replace function public.new_bid_proposal(p_ws uuid, p_title text, p_sections jsonb, p_by_ai boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_next int;
begin
  if not public.owns_bid(p_ws) then raise exception 'Bid not found'; end if;
  if jsonb_typeof(p_sections) is distinct from 'array' then raise exception 'Invalid proposal'; end if;
  perform 1 from public.bid_workspaces where id = p_ws for update;
  select coalesce(max(version), 0) + 1 into v_next from public.bid_proposals where workspace_id = p_ws;
  insert into public.bid_proposals (workspace_id, version, title, sections, by_ai) values (p_ws, v_next, left(coalesce(nullif(btrim(p_title), ''), 'Proposal'), 200), p_sections, coalesce(p_by_ai, false)) returning id into v_id;
  perform public.log_bid(p_ws, 'proposal', 'Proposal version ' || v_next || case when p_by_ai then ' drafted with AI' else ' started' end);
  update public.bid_workspaces set status = 'preparing_bid' where id = p_ws and status in ('new', 'under_review', 'qualified');
  return v_id;
end;
$$;

-- The human decision: draft -> internal review -> approved. The AI endpoints cannot call this; it needs the signed-in owner.
create or replace function public.set_bid_proposal_status(p_proposal uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ws uuid; v_sections jsonb; v_wstatus text;
begin
  if p_status not in ('draft', 'internal_review', 'approved') then raise exception 'Invalid status'; end if;
  select p.workspace_id, p.sections into v_ws, v_sections from public.bid_proposals p where p.id = p_proposal;
  if v_ws is null or not public.owns_bid(v_ws) then raise exception 'Proposal not found'; end if;
  select status into v_wstatus from public.bid_workspaces where id = v_ws for update;
  if v_wstatus in ('submitted', 'awarded', 'lost', 'expired') then raise exception 'This bid is closed'; end if;
  if p_status = 'approved' then
    if not exists (select 1 from jsonb_array_elements(v_sections) s where btrim(coalesce(s->>'body', '')) <> '') then raise exception 'The proposal is empty'; end if;
    if public.bid_blockers(v_ws) > 0 then raise exception 'Every mandatory requirement must be verified first (% left)', public.bid_blockers(v_ws); end if;
    update public.bid_proposals set status = 'draft', approved_at = null, approved_by = null where workspace_id = v_ws and id <> p_proposal and status = 'approved';
    update public.bid_proposals set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_proposal;
    update public.bid_workspaces set status = 'approved' where id = v_ws and status <> 'approved';
  else
    update public.bid_proposals set status = p_status, approved_at = null, approved_by = null where id = p_proposal;
    update public.bid_workspaces set status = case when p_status = 'internal_review' then 'internal_review' else 'preparing_bid' end where id = v_ws and status in ('new', 'under_review', 'qualified', 'preparing_bid', 'internal_review', 'approved');
  end if;
  perform public.log_bid(v_ws, 'proposal', 'Proposal ' || replace(p_status, '_', ' '));
end;
$$;

-- Start a workspace for a notice the business has unlocked. Returns the existing one when there is one.
create or replace function public.start_bid_workspace(p_bid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_listing uuid; v_id uuid; b public.gov_bids%rowtype;
begin
  select o.listing_id into v_listing from public.listing_owners o where o.user_id = auth.uid() limit 1;
  if v_listing is null then raise exception 'No business on this account'; end if;
  select w.id into v_id from public.bid_workspaces w where w.listing_id = v_listing and w.gov_bid_id = p_bid;
  if v_id is not null then return v_id; end if;
  select * into b from public.gov_bids where id = p_bid;
  if b.id is null then raise exception 'Bid not found'; end if;
  if not (exists (select 1 from public.opportunity_unlocks u where u.listing_id = v_listing and u.kind = 'bid' and u.item_id = p_bid) or public.is_premium(v_listing)) then
    raise exception 'Unlock this bid first';
  end if;
  insert into public.bid_workspaces (listing_id, gov_bid_id, title, agency, solicitation_number, location, source, due_at, source_hash)
  values (v_listing, p_bid, left(b.title, 300), left(b.agency, 200), left(b.solicitation_number, 120), left(concat_ws(', ', b.city, b.state), 300), 'Federal contract notice', b.response_due,
          md5(coalesce(b.title, '') || '|' || coalesce(b.description, '') || '|' || coalesce(b.response_due::text, '')))
  returning id into v_id;
  insert into public.bid_documents (workspace_id, name, doc_type, extracted_text)
  values (v_id, 'Notice description', 'Solicitation', left(btrim(coalesce(nullif(b.description, ''), b.summary)), 120000));
  update public.bid_workspaces set status = 'under_review' where id = v_id;
  return v_id;
exception when unique_violation then
  select w.id into v_id from public.bid_workspaces w where w.listing_id = v_listing and w.gov_bid_id = p_bid;
  return v_id;
end;
$$;

-- Amendment monitoring where the notice comes from the site: which workspaces have a notice that changed since they were started.
create or replace function public.my_bid_source_changes()
returns table (workspace_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select w.id from public.bid_workspaces w
    join public.listing_owners o on o.listing_id = w.listing_id
    join public.gov_bids b on b.id = w.gov_bid_id
   where o.user_id = auth.uid() and w.source_hash is distinct from md5(coalesce(b.title, '') || '|' || coalesce(b.description, '') || '|' || coalesce(b.response_due::text, ''));
$$;

-- Take the changed notice into the workspace: new deadline and description text, and a note on the timeline.
create or replace function public.refresh_bid_source(p_ws uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b public.gov_bids%rowtype; w public.bid_workspaces%rowtype;
begin
  if not public.owns_bid(p_ws) then raise exception 'Bid not found'; end if;
  select * into w from public.bid_workspaces where id = p_ws;
  select * into b from public.gov_bids where id = w.gov_bid_id;
  if b.id is null then return; end if;
  update public.bid_workspaces set title = left(b.title, 300), due_at = b.response_due, analyzed_at = null,
         source_hash = md5(coalesce(b.title, '') || '|' || coalesce(b.description, '') || '|' || coalesce(b.response_due::text, '')) where id = p_ws;
  update public.bid_documents set extracted_text = left(btrim(coalesce(nullif(b.description, ''), b.summary)), 120000)
   where workspace_id = p_ws and name = 'Notice description';
  perform public.log_bid(p_ws, 'amendment', 'The notice changed. The deadline and description were updated; analyse the solicitation again and re-check the requirements.');
end;
$$;

-- Deadline passed without a submission: mark the open bids Expired. Called when the page opens.
create or replace function public.refresh_bid_deadlines()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with gone as (
    update public.bid_workspaces w set status = 'expired'
     where w.due_at < now() and w.status in ('new', 'under_review', 'qualified', 'preparing_bid', 'internal_review', 'approved')
       and exists (select 1 from public.listing_owners o where o.listing_id = w.listing_id and o.user_id = auth.uid())
    returning 1)
  select count(*)::int into n from gone;
  return n;
end;
$$;

-- An awarded bid becomes a project, once. Contact details come from the notice on the server; the browser supplies none.
create or replace function public.convert_bid_to_project(p_ws uuid, p_contract_value numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.bid_workspaces%rowtype;
  v_project uuid; v_quote uuid; v_value numeric; v_name text; v_phone text; v_email text; v_desc text; v_scope text;
  b public.gov_bids%rowtype; v_person jsonb;
begin
  if not public.owns_bid(p_ws) then raise exception 'Bid not found'; end if;
  select * into w from public.bid_workspaces where id = p_ws for update;
  select p.id into v_project from public.projects p where p.bid_workspace_id = p_ws;
  if v_project is not null then return v_project; end if;
  if w.gov_bid_id is not null then
    select c.project_id into v_project from public.lead_conversions c where c.listing_id = w.listing_id and c.kind = 'bid' and c.item_id = w.gov_bid_id;
    if v_project is not null then
      update public.projects set bid_workspace_id = p_ws where id = v_project and bid_workspace_id is null;
      return v_project;
    end if;
  end if;
  if w.status <> 'awarded' then raise exception 'Only an awarded bid can become a project'; end if;
  v_value := coalesce(nullif(p_contract_value, 0), w.contract_value);
  if v_value is null or v_value <= 0 then raise exception 'Enter the awarded contract value'; end if;

  v_desc := left(coalesce(w.analysis->>'scope_of_work', ''), 4000);
  v_scope := v_desc;
  if w.gov_bid_id is not null then
    select * into b from public.gov_bids where id = w.gov_bid_id;
    v_person := (select e from jsonb_array_elements(coalesce(b.contacts, '[]'::jsonb)) e where coalesce(e->>'phone', e->>'email') is not null limit 1);
    v_name := v_person->>'name'; v_phone := v_person->>'phone'; v_email := v_person->>'email';
    if v_desc = '' then v_desc := left(coalesce(nullif(b.description, ''), b.summary), 4000); end if;
  end if;

  insert into public.projects (listing_id, name, description, scope, status, client_name, client_company, client_phone, client_email, location, industry, trade,
                               lead_kind, lead_item_id, contract_value, bid_workspace_id, notes)
  values (w.listing_id, left(w.title, 300), nullif(v_desc, ''), nullif(v_scope, ''), 'awarded', left(nullif(v_name, ''), 200), left(nullif(w.agency, ''), 200), left(nullif(v_phone, ''), 60), left(nullif(v_email, ''), 200),
          left(nullif(w.location, ''), 300), 'Government contract', 'HVAC',
          case when w.gov_bid_id is null then null else 'bid' end, w.gov_bid_id, v_value, p_ws, left(w.notes, 4000))
  returning id into v_project;

  insert into public.quotations (listing_id, project_id, lead_kind, lead_item_id, title, amount_usd, status, sent_on, accepted_on)
  values (w.listing_id, v_project, case when w.gov_bid_id is null then null else 'bid' end, w.gov_bid_id, 'Awarded contract', v_value, 'accepted', current_date, current_date)
  returning id into v_quote;
  if w.gov_bid_id is not null then
    insert into public.lead_conversions (listing_id, kind, item_id, project_id, quotation_id) values (w.listing_id, 'bid', w.gov_bid_id, v_project, v_quote);
    update public.lead_pipeline set stage = 'converted', amount_usd = v_value, updated_at = now() where listing_id = w.listing_id and kind = 'bid' and item_id = w.gov_bid_id;
  end if;

  insert into public.project_documents (project_id, name, url, category)
  select v_project, d.name, d.url, case d.doc_type when 'Drawing' then 'Drawing' else 'Other' end from public.bid_documents d where d.workspace_id = p_ws and d.url is not null;
  insert into public.project_activities (project_id, type, body, created_at)
  select v_project, case when a.type = 'note' then 'note' else 'status' end, a.body, a.created_at from public.bid_activities a where a.workspace_id = p_ws order by a.id;
  perform public.log_project(v_project, 'converted', 'Project created from the awarded government bid');
  perform public.log_bid(p_ws, 'converted', 'Converted to a project');
  return v_project;
end;
$$;

revoke all on function public.owns_bid(uuid) from public, anon;
revoke all on function public.log_bid(uuid, text, text) from public, anon, authenticated;
revoke all on function public.bid_blockers(uuid) from public, anon;
revoke all on function public.trg_bid_guard() from public, anon, authenticated;
revoke all on function public.trg_bid_logged() from public, anon, authenticated;
revoke all on function public.trg_bid_children_logged() from public, anon, authenticated;
revoke all on function public.trg_proposal_edit() from public, anon, authenticated;
revoke all on function public.new_bid_proposal(uuid, text, jsonb, boolean) from public, anon;
revoke all on function public.set_bid_proposal_status(uuid, text) from public, anon;
revoke all on function public.start_bid_workspace(uuid) from public, anon;
revoke all on function public.my_bid_source_changes() from public, anon;
revoke all on function public.refresh_bid_source(uuid) from public, anon;
revoke all on function public.refresh_bid_deadlines() from public, anon;
revoke all on function public.convert_bid_to_project(uuid, numeric) from public, anon;
grant execute on function public.owns_bid(uuid) to authenticated;
grant execute on function public.bid_blockers(uuid) to authenticated;
grant execute on function public.new_bid_proposal(uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.set_bid_proposal_status(uuid, text) to authenticated;
grant execute on function public.start_bid_workspace(uuid) to authenticated;
grant execute on function public.my_bid_source_changes() to authenticated;
grant execute on function public.refresh_bid_source(uuid) to authenticated;
grant execute on function public.refresh_bid_deadlines() to authenticated;
grant execute on function public.convert_bid_to_project(uuid, numeric) to authenticated;
