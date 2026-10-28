-- Run AFTER schema.sql. Supabase: SQL Editor > New query > paste > Run.
-- Stores messages sent through the Contact page. The public can only INSERT; only admins can read or manage them.

create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status     text not null default 'new' check (status in ('new', 'read', 'archived')),
  name       text not null check (char_length(name) between 2 and 120),
  email      text not null check (char_length(email) between 5 and 200),
  topic      text not null check (char_length(topic) <= 80),
  message    text not null check (char_length(message) between 10 and 3000)
);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "Anyone can send a contact message" on public.contact_messages;
create policy "Anyone can send a contact message"
  on public.contact_messages for insert to anon, authenticated
  with check (status = 'new');

drop policy if exists "Admins manage contact messages" on public.contact_messages;
create policy "Admins manage contact messages"
  on public.contact_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
