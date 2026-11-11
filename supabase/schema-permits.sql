-- Run any time after schema.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Public building permits pulled from city open-data portals (Austin, Dallas, ...). Each permit has the trade it is for, the project
-- value, whether the property is residential or commercial, and a one-line summary. Admins read them in Admin > Permits.
-- Property owners' names are not stored. Only the importer (scripts/permits, using the service role key) writes to the table.

create table if not exists public.public_permits (
  id             uuid primary key default gen_random_uuid(),
  imported_at    timestamptz not null default now(),
  source         text not null check (char_length(source) between 2 and 40),      -- "austin", "dallas", ...
  source_id      text not null check (char_length(source_id) between 1 and 120),  -- the city's own permit number
  city           text not null,
  permit_type    text,
  issued_on      date,
  trade          text not null default 'HVAC' check (trade = 'HVAC'),             -- only HVAC permits are kept
  value_usd      numeric(14, 2) check (value_usd is null or value_usd >= 0),       -- project value; null when the city gave none
  property_class text not null default 'unknown' check (property_class in ('residential', 'commercial', 'unknown')),
  summary        text not null,
  description    text,
  address        text,
  zip            text,
  contractor_name text,
  source_url     text,
  unique (source, source_id)
);
create index if not exists public_permits_issued_idx on public.public_permits (issued_on desc nulls last);
create index if not exists public_permits_trade_idx on public.public_permits (trade);
create index if not exists public_permits_city_idx on public.public_permits (city);

-- Only heating, cooling and ventilation permits are kept. Anything else saved earlier is removed, and the database refuses new ones.
delete from public.public_permits where trade <> 'HVAC';
alter table public.public_permits drop constraint if exists public_permits_hvac_only;
alter table public.public_permits add constraint public_permits_hvac_only check (trade = 'HVAC');

alter table public.public_permits enable row level security;
revoke all on public.public_permits from anon, authenticated;
grant select on public.public_permits to authenticated;
drop policy if exists "Admins read permits" on public.public_permits;
create policy "Admins read permits" on public.public_permits for select to authenticated using (public.is_admin());
