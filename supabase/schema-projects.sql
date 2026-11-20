-- Run AFTER schema-myleads.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run. Existing records are kept.
-- Projects: real jobs and contracts a business has won. A project is created ONLY by converting an accepted lead
-- (convert_lead_to_project below) or by hand; an unlocked lead never becomes a project by itself.
--   projects            the job: client, location, value, dates, status, notes
--   lead_conversions    one row per converted lead: the hard guarantee that a lead becomes a project once
--   quotations          offers made to a client; one accepted offer is needed to convert
--   project_tasks, project_documents (links), project_team, project_expenses, project_activities (the timeline)
-- Every table is private to the business that owns it. Contact details only enter a project through the conversion function,
-- which re-checks on the server that the lead was unlocked; the browser never supplies them.

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 300),
  description     text check (char_length(description) <= 4000),
  status          text not null default 'evaluating' check (status in ('evaluating', 'preparing_proposal', 'bid_submitted', 'awarded', 'in_progress', 'completed', 'lost_cancelled')),
  client_name     text check (char_length(client_name) <= 200),
  client_company  text check (char_length(client_company) <= 200),
  client_phone    text check (char_length(client_phone) <= 60),
  client_email    text check (char_length(client_email) <= 200),
  location        text check (char_length(location) <= 300),
  industry        text check (char_length(industry) <= 120),
  trade           text check (char_length(trade) <= 120),
  scope           text check (char_length(scope) <= 4000),
  lead_kind       text check (lead_kind in ('lead', 'permit', 'bid')),
  lead_item_id    uuid,
  contract_value  numeric(14, 2) check (contract_value >= 0),
  start_on        date,
  expected_end_on date,
  notes           text check (char_length(notes) <= 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((lead_kind is null) = (lead_item_id is null))
);
create index if not exists projects_listing_idx on public.projects (listing_id, updated_at desc);
-- A lead links to at most one project per business.
create unique index if not exists projects_lead_uniq on public.projects (listing_id, lead_kind, lead_item_id) where lead_item_id is not null;

create table if not exists public.quotations (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  lead_kind    text check (lead_kind in ('lead', 'permit', 'bid')),
  lead_item_id uuid,
  title        text not null check (char_length(title) between 1 and 200),
  amount_usd   numeric(14, 2) not null check (amount_usd >= 0),
  status       text not null default 'sent' check (status in ('draft', 'sent', 'accepted', 'declined')),
  notes        text check (char_length(notes) <= 2000),
  sent_on      date,
  accepted_on  date,
  created_at   timestamptz not null default now()
);
create index if not exists quotations_listing_idx on public.quotations (listing_id, created_at desc);

create table if not exists public.lead_conversions (
  listing_id   uuid not null references public.listings (id) on delete cascade,
  kind         text not null check (kind in ('lead', 'permit', 'bid')),
  item_id      uuid not null,
  project_id   uuid not null references public.projects (id) on delete cascade,
  quotation_id uuid references public.quotations (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (listing_id, kind, item_id)
);

create table if not exists public.project_tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 300),
  assignee   text check (char_length(assignee) <= 120),
  due_on     date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.project_documents (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  url        text not null check (url ~* '^https?://' and char_length(url) <= 1000),
  category   text check (char_length(category) <= 60),
  created_at timestamptz not null default now()
);
create table if not exists public.project_team (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  role       text check (char_length(role) <= 120),
  phone      text check (char_length(phone) <= 60),
  email      text check (char_length(email) <= 200),
  created_at timestamptz not null default now()
);
create table if not exists public.project_expenses (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 300),
  amount_usd  numeric(14, 2) not null check (amount_usd >= 0),
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now()
);
create table if not exists public.project_activities (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  type       text not null check (type in ('created', 'status', 'note', 'call', 'email', 'follow_up', 'unlock', 'converted', 'task', 'document', 'team', 'expense', 'quotation')),
  body       text check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists project_activities_idx on public.project_activities (project_id, id desc);
create index if not exists project_tasks_idx on public.project_tasks (project_id);
create index if not exists project_documents_idx on public.project_documents (project_id);
create index if not exists project_team_idx on public.project_team (project_id);
create index if not exists project_expenses_idx on public.project_expenses (project_id);

-- Access ---------------------------------------------------------------------------------------------------
create or replace function public.owns_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.projects p join public.listing_owners o on o.listing_id = p.listing_id where p.id = p_project and o.user_id = auth.uid());
$$;
create or replace function public.owns_listing(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listing_owners o where o.listing_id = p_listing and o.user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'quotations', 'lead_conversions', 'project_tasks', 'project_documents', 'project_team', 'project_expenses', 'project_activities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Owners read everything of theirs; admins read projects for support.
grant select on public.projects, public.quotations, public.lead_conversions, public.project_activities to authenticated;
grant insert, delete on public.projects to authenticated;
-- An owner edits the job's details, never which business owns it or which lead it came from.
grant update (name, description, status, client_name, client_company, client_phone, client_email, location, industry, trade, scope, contract_value, start_on, expected_end_on, notes)
  on public.projects to authenticated;
grant insert, update, delete on public.quotations to authenticated;
grant select, insert, update, delete on public.project_tasks, public.project_documents, public.project_team, public.project_expenses to authenticated;
grant insert on public.project_activities to authenticated;

drop policy if exists "Owners read projects" on public.projects;
create policy "Owners read projects" on public.projects for select to authenticated using (public.owns_listing(listing_id));
drop policy if exists "Admins read projects" on public.projects;
create policy "Admins read projects" on public.projects for select to authenticated using (public.is_admin());
-- A project linked to a lead can only be made by convert_lead_to_project, so a lead cannot become two projects or borrow someone else's data.
drop policy if exists "Owners add manual projects" on public.projects;
create policy "Owners add manual projects" on public.projects for insert to authenticated with check (public.owns_listing(listing_id) and lead_item_id is null and lead_kind is null);
drop policy if exists "Owners edit projects" on public.projects;
create policy "Owners edit projects" on public.projects for update to authenticated using (public.owns_listing(listing_id)) with check (public.owns_listing(listing_id));
drop policy if exists "Owners delete projects" on public.projects;
create policy "Owners delete projects" on public.projects for delete to authenticated using (public.owns_listing(listing_id) and lead_item_id is null);

drop policy if exists "Owners manage quotations" on public.quotations;
create policy "Owners manage quotations" on public.quotations for all to authenticated
  using (public.owns_listing(listing_id)) with check (public.owns_listing(listing_id) and (project_id is null or public.owns_project(project_id)));
drop policy if exists "Owners read conversions" on public.lead_conversions;
create policy "Owners read conversions" on public.lead_conversions for select to authenticated using (public.owns_listing(listing_id));

do $$
declare t text;
begin
  foreach t in array array['project_tasks', 'project_documents', 'project_team', 'project_expenses'] loop
    execute format('drop policy if exists "Owners manage rows" on public.%I', t);
    execute format('create policy "Owners manage rows" on public.%I for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id))', t);
  end loop;
end $$;
drop policy if exists "Owners read timeline" on public.project_activities;
create policy "Owners read timeline" on public.project_activities for select to authenticated using (public.owns_project(project_id));
-- Owners may add notes to the timeline; every other entry is written by the database.
drop policy if exists "Owners add notes" on public.project_activities;
create policy "Owners add notes" on public.project_activities for insert to authenticated with check (type = 'note' and public.owns_project(project_id));

-- Timeline entries written by the database ------------------------------------------------------------------------
create or replace function public.log_project(p_project uuid, p_type text, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.project_activities (project_id, type, body) values (p_project, p_type, left(p_body, 2000));
$$;

create or replace function public.trg_projects_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.trg_projects_touch();

create or replace function public.trg_projects_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lead_item_id is null then perform public.log_project(new.id, 'created', 'Project created'); end if;
  elsif new.status is distinct from old.status then
    perform public.log_project(new.id, 'status', 'Status: ' || replace(initcap(replace(new.status, '_', ' ')), 'Lost Cancelled', 'Lost or cancelled'));
  end if;
  return null;
end;
$$;
drop trigger if exists projects_logged on public.projects;
create trigger projects_logged after insert or update on public.projects for each row execute function public.trg_projects_logged();

create or replace function public.trg_children_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'project_tasks' then
    if tg_op = 'INSERT' then perform public.log_project(new.project_id, 'task', 'Task added: ' || new.title);
    elsif new.done is distinct from old.done then perform public.log_project(new.project_id, 'task', case when new.done then 'Task done: ' else 'Task reopened: ' end || new.title); end if;
  elsif tg_table_name = 'project_documents' and tg_op = 'INSERT' then perform public.log_project(new.project_id, 'document', 'Document added: ' || new.name);
  elsif tg_table_name = 'project_team' and tg_op = 'INSERT' then perform public.log_project(new.project_id, 'team', 'Team member added: ' || new.name);
  elsif tg_table_name = 'project_expenses' and tg_op = 'INSERT' then perform public.log_project(new.project_id, 'expense', 'Expense: ' || new.description || ' ($' || trim(to_char(new.amount_usd, 'FM999,999,999.00')) || ')');
  end if;
  return null;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['project_tasks', 'project_documents', 'project_team', 'project_expenses'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_logged', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.trg_children_logged()', t || '_logged', t);
  end loop;
end $$;

create or replace function public.trg_quotations_logged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    perform public.log_project(new.project_id, 'quotation', 'Quotation ' || new.status || ': ' || new.title || ' ($' || trim(to_char(new.amount_usd, 'FM999,999,999.00')) || ')');
  end if;
  return null;
end;
$$;
drop trigger if exists quotations_logged on public.quotations;
create trigger quotations_logged after insert or update on public.quotations for each row execute function public.trg_quotations_logged();

-- Convert an accepted lead into a project -------------------------------------------------------------------------------
-- Rules, all enforced here and not in the browser:
--   * the lead must be one of the caller's own and must be Accepted ("won");
--   * it must be unlocked (paid, or open on Premium), because contact details are copied from the source record on the server;
--   * calling it again returns the same project: a lead becomes a project once, even with two clicks at the same moment;
--   * the original lead stays in My Leads with the status Converted, and keeps its purchase record and timeline.
-- An accepted quotation is needed: the latest accepted one for the lead is used, or one is recorded now from p_contract_value.
create or replace function public.convert_lead_to_project(p_kind text, p_item uuid, p_industry text default null, p_trade text default null, p_contract_value numeric default null, p_quote_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
  v_pipe public.lead_pipeline%rowtype;
  v_project uuid;
  v_quote public.quotations%rowtype;
  v_name text; v_desc text; v_loc text; v_cname text; v_company text; v_phone text; v_email text;
  v_unlocked boolean;
  v_person jsonb;
begin
  if p_kind not in ('lead', 'permit', 'bid') then raise exception 'Invalid lead type'; end if;
  select o.listing_id into v_listing
    from public.listing_owners o join public.lead_pipeline p on p.listing_id = o.listing_id
   where o.user_id = auth.uid() and p.kind = p_kind and p.item_id = p_item
   limit 1;
  if v_listing is null then raise exception 'Lead not found'; end if;

  -- Serialises two clicks at once: the second waits here, then finds the conversion below.
  select * into v_pipe from public.lead_pipeline where listing_id = v_listing and kind = p_kind and item_id = p_item for update;
  select c.project_id into v_project from public.lead_conversions c where c.listing_id = v_listing and c.kind = p_kind and c.item_id = p_item;
  if v_project is not null then return v_project; end if;

  if v_pipe.stage <> 'won' then raise exception 'Only an accepted offer can become a project. Set the lead to Accepted first.'; end if;

  select * into v_quote from public.quotations q
   where q.listing_id = v_listing and q.lead_kind = p_kind and q.lead_item_id = p_item and q.status = 'accepted' and q.project_id is null
   order by q.created_at desc limit 1;
  if v_quote.id is null then
    if p_contract_value is null or p_contract_value <= 0 then raise exception 'Enter the accepted contract value'; end if;
    insert into public.quotations (listing_id, lead_kind, lead_item_id, title, amount_usd, status, notes, sent_on, accepted_on)
    values (v_listing, p_kind, p_item, 'Accepted offer', p_contract_value, 'accepted', nullif(left(btrim(coalesce(p_quote_note, '')), 2000), ''), current_date, current_date)
    returning * into v_quote;
  end if;

  -- Copy what we know from the source record. Only an unlocked lead has contact details to copy.
  if p_kind = 'lead' then
    select (a.unlocked_at is not null or public.is_premium(a.listing_id)),
           btrim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), l.phone, l.email,
           coalesce(nullif(l.description, ''), l.issue), concat_ws(', ', l.city, l.state), l.issue
      into v_unlocked, v_cname, v_phone, v_email, v_desc, v_loc, v_name
      from public.lead_assignments a join public.leads l on l.id = a.lead_id
     where a.lead_id = p_item and a.listing_id = v_listing;
    v_name := coalesce(nullif(v_cname, ''), 'Customer') || ' - ' || coalesce(v_name, 'service request');
  elsif p_kind = 'permit' then
    select exists (select 1 from public.opportunity_unlocks u where u.listing_id = v_listing and u.kind = 'permit' and u.item_id = p_item) or public.is_premium(v_listing) into v_unlocked;
    select p.summary, coalesce(nullif(p.description, ''), p.summary), concat_ws(', ', p.address, p.city),
           (select e from jsonb_array_elements(coalesce(p.people, '[]'::jsonb)) e where coalesce(e->>'phone', e->>'email') is not null limit 1),
           p.contractor_name
      into v_name, v_desc, v_loc, v_person, v_company
      from public.public_permits p where p.id = p_item;
    if v_person is null then v_person := (select e from jsonb_array_elements((select coalesce(people, '[]'::jsonb) from public.public_permits where id = p_item)) e limit 1); end if;
    v_cname := v_person->>'name'; v_phone := v_person->>'phone'; v_email := v_person->>'email'; v_company := coalesce(v_person->>'company', v_company);
  else
    select exists (select 1 from public.opportunity_unlocks u where u.listing_id = v_listing and u.kind = 'bid' and u.item_id = p_item) or public.is_premium(v_listing) into v_unlocked;
    select b.title, coalesce(nullif(b.description, ''), b.summary), concat_ws(', ', b.city, b.state),
           (select e from jsonb_array_elements(coalesce(b.contacts, '[]'::jsonb)) e where coalesce(e->>'phone', e->>'email') is not null limit 1), b.agency
      into v_name, v_desc, v_loc, v_person, v_company
      from public.gov_bids b where b.id = p_item;
    v_cname := v_person->>'name'; v_phone := v_person->>'phone'; v_email := v_person->>'email';
  end if;
  if not coalesce(v_unlocked, false) then raise exception 'Unlock this lead first'; end if;

  insert into public.projects (listing_id, name, description, status, client_name, client_company, client_phone, client_email, location, industry, trade,
                               lead_kind, lead_item_id, contract_value, notes)
  values (v_listing, left(coalesce(v_name, 'Project'), 300), left(v_desc, 4000), 'awarded', left(nullif(v_cname, ''), 200), left(nullif(v_company, ''), 200),
          left(nullif(v_phone, ''), 60), left(nullif(v_email, ''), 200), left(nullif(v_loc, ''), 300), left(nullif(p_industry, ''), 120), left(nullif(p_trade, ''), 120),
          p_kind, p_item, v_quote.amount_usd, v_pipe.note)
  returning id into v_project;

  update public.quotations set project_id = v_project where id = v_quote.id;
  insert into public.lead_conversions (listing_id, kind, item_id, project_id, quotation_id) values (v_listing, p_kind, p_item, v_project, v_quote.id);

  -- The lead's history comes with it, oldest first, so the project timeline reads as one story.
  insert into public.project_activities (project_id, type, body, created_at)
  select v_project, case when a.type in ('status', 'note', 'call', 'email', 'follow_up', 'unlock', 'converted') then a.type else 'note' end, a.body, a.created_at
    from public.lead_activities a where a.listing_id = v_listing and a.kind = p_kind and a.item_id = p_item order by a.id;
  perform public.log_project(v_project, 'converted', 'Project created from the accepted ' || case p_kind when 'lead' then 'customer request' when 'permit' then 'building permit' else 'government bid' end);
  insert into public.lead_activities (listing_id, kind, item_id, type, body) values (v_listing, p_kind, p_item, 'converted', 'Converted to a project');

  update public.lead_pipeline set stage = 'converted', amount_usd = v_quote.amount_usd, updated_at = now() where listing_id = v_listing and kind = p_kind and item_id = p_item;
  return v_project;
end;
$$;

revoke all on function public.owns_project(uuid) from public, anon;
revoke all on function public.owns_listing(uuid) from public, anon;
revoke all on function public.log_project(uuid, text, text) from public, anon, authenticated;
revoke all on function public.trg_projects_logged() from public, anon, authenticated;
revoke all on function public.trg_children_logged() from public, anon, authenticated;
revoke all on function public.trg_quotations_logged() from public, anon, authenticated;
revoke all on function public.convert_lead_to_project(text, uuid, text, text, numeric, text) from public, anon;
grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.owns_listing(uuid) to authenticated;
grant execute on function public.convert_lead_to_project(text, uuid, text, text, numeric, text) to authenticated;
