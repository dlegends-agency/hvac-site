-- Run AFTER schema-flow.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Messages between a customer and a business that received their request.
--   * A conversation opens when the business has paid to unlock the customer's request. Until then it is locked for both sides.
--   * Once unlocked, the business can write to the customer and the customer can reply or write to that business.
--   * Messages stay inside the site. A business never sees the customer's phone or email through a message.
--   * Nobody reads the table directly: every read and write goes through the functions below, which check who is asking.
--   * It also adds the customer-facing request log (my_request_log).

create table if not exists public.lead_messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  sender     text not null check (sender in ('business', 'customer')),
  sender_id  uuid default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at    timestamptz
);
create index if not exists lead_messages_thread_idx on public.lead_messages (lead_id, listing_id, id);
create index if not exists lead_messages_listing_idx on public.lead_messages (listing_id, created_at desc);
alter table public.lead_messages enable row level security;

revoke all on public.lead_messages from anon, authenticated;
grant select on public.lead_messages to authenticated;
drop policy if exists "Admins read messages" on public.lead_messages;
create policy "Admins read messages" on public.lead_messages for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- who is who
create or replace function public.listing_is_paid(p_listing uuid)
returns boolean language sql security definer set search_path = public stable
as $$ select exists (select 1 from public.listings l where l.id = p_listing and l.plan = 'featured' and (l.plan_until is null or l.plan_until > now())) $$;

create or replace function public.owns_listing(p_listing uuid)
returns boolean language sql security definer set search_path = public stable
as $$ select auth.uid() is not null and exists (select 1 from public.listing_owners o where o.listing_id = p_listing and o.user_id = auth.uid()) $$;

-- The same rule as my_requests(): the request is linked to the account, or sent earlier with the account's confirmed email address.
create or replace function public.is_customer_of_lead(p_lead uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select auth.uid() is not null and exists (
    select 1 from public.leads l
     where l.id = p_lead and l.status <> 'spam'
       and (l.customer_id = auth.uid()
            or lower(l.email) = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null))
  )
$$;

revoke all on function public.listing_is_paid(uuid), public.owns_listing(uuid), public.is_customer_of_lead(uuid) from public, anon;
grant execute on function public.listing_is_paid(uuid), public.owns_listing(uuid), public.is_customer_of_lead(uuid) to authenticated;

-- ---------------------------------------------------------------- send
create or replace function public.send_message(p_lead uuid, p_listing uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender text;
  v_body   text := btrim(coalesce(p_body, ''));
  v_id     bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'A message is 1 to 2000 characters'; end if;
  if not exists (select 1 from public.lead_assignments a where a.lead_id = p_lead and a.listing_id = p_listing) then
    raise exception 'That business did not receive this request' using errcode = '42501';
  end if;
  if public.owns_listing(p_listing) then v_sender := 'business';
  elsif public.is_customer_of_lead(p_lead) then v_sender := 'customer';
  else raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lead_assignments a where a.lead_id = p_lead and a.listing_id = p_listing and a.unlocked_at is not null) then
    raise exception 'Unlock this request to send messages' using errcode = '42501';
  end if;
  if (select count(*) from public.lead_messages m where m.lead_id = p_lead and m.listing_id = p_listing and m.sender = v_sender
        and m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages. Please wait a little.';
  end if;
  insert into public.lead_messages (lead_id, listing_id, sender, body) values (p_lead, p_listing, v_sender, v_body) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- the customer's conversations
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  lead_id uuid, listing_id uuid, business_name text, slug text, issue text, requested_at timestamptz,
  can_send boolean, last_body text, last_sender text, last_at timestamptz, unread int
)
language sql
security definer
set search_path = public
stable
as $$
  select a.lead_id, a.listing_id, b.business_name, b.slug, l.issue, l.created_at,
         (a.unlocked_at is not null),
         lm.body, lm.sender, lm.created_at,
         (select count(*)::int from public.lead_messages m where m.lead_id = a.lead_id and m.listing_id = a.listing_id and m.sender = 'business' and m.read_at is null)
    from public.lead_assignments a
    join public.leads l on l.id = a.lead_id
    join public.listings b on b.id = a.listing_id and b.status = 'published'
    left join lateral (select m.body, m.sender, m.created_at from public.lead_messages m
                        where m.lead_id = a.lead_id and m.listing_id = a.listing_id order by m.id desc limit 1) lm on true
   where public.is_customer_of_lead(a.lead_id)
     and (lm.body is not null or a.unlocked_at is not null)
   order by lm.created_at desc nulls last, a.assigned_at desc;
$$;

-- ---------------------------------------------------------------- the business's conversations
-- Customers who have written, and the request named in p_lead (so a business can start a conversation from a request).
-- The customer's first name is shown only once the business has unlocked the request.
drop function if exists public.business_conversations(uuid);
create or replace function public.business_conversations(p_lead uuid default null)
returns table (
  lead_id uuid, listing_id uuid, customer text, issue text, city text, state text, requested_at timestamptz,
  can_send boolean, last_body text, last_sender text, last_at timestamptz, unread int
)
language sql
security definer
set search_path = public
stable
as $$
  select a.lead_id, a.listing_id,
         case when a.unlocked_at is not null then l.first_name else 'Customer' end,
         l.issue, l.city, l.state, l.created_at,
         (a.unlocked_at is not null),
         lm.body, lm.sender, lm.created_at,
         (select count(*)::int from public.lead_messages m where m.lead_id = a.lead_id and m.listing_id = a.listing_id and m.sender = 'customer' and m.read_at is null)
    from public.lead_assignments a
    join public.leads l on l.id = a.lead_id and l.status <> 'spam'
    left join lateral (select m.body, m.sender, m.created_at from public.lead_messages m
                        where m.lead_id = a.lead_id and m.listing_id = a.listing_id order by m.id desc limit 1) lm on true
   where public.owns_listing(a.listing_id)
     and (lm.body is not null or a.lead_id = p_lead)
   order by lm.created_at desc nulls last, a.assigned_at desc;
$$;

-- ---------------------------------------------------------------- read one conversation
-- Returns the messages to whoever is in the conversation, and marks the other side's messages as read.
drop function if exists public.conversation_messages(uuid, uuid);
create or replace function public.conversation_messages(p_lead uuid, p_listing uuid)
returns table (id bigint, created_at timestamptz, sender text, body text, mine boolean, read_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.lead_assignments a where a.lead_id = p_lead and a.listing_id = p_listing) then return; end if;
  if public.owns_listing(p_listing) then v_role := 'business';
  elsif public.is_customer_of_lead(p_lead) then v_role := 'customer';
  else return;
  end if;
  update public.lead_messages m set read_at = now()
   where m.lead_id = p_lead and m.listing_id = p_listing and m.sender <> v_role and m.read_at is null;
  return query
    select m.id, m.created_at, m.sender, m.body, (m.sender = v_role), m.read_at
      from public.lead_messages m where m.lead_id = p_lead and m.listing_id = p_listing order by m.id;
end;
$$;

-- Unread messages for the signed-in person, as a customer and as a business (for the badge in the menus).
create or replace function public.my_unread_messages()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'as_customer', (select count(*) from public.lead_messages m where m.sender = 'business' and m.read_at is null and public.is_customer_of_lead(m.lead_id)),
    'as_business', (select count(*) from public.lead_messages m where m.sender = 'customer' and m.read_at is null and public.owns_listing(m.listing_id))
  )
$$;

-- ---------------------------------------------------------------- the customer's request log
-- What happened to one of the customer's own requests, in plain steps. No other business's private steps, no money, no notes.
drop function if exists public.my_request_log(uuid);
create or replace function public.my_request_log(p_lead uuid)
returns table (created_at timestamptz, kind text, business_name text)
language sql
security definer
set search_path = public
stable
as $$
  select * from (
    select e.created_at,
           case e.kind when 'received' then 'received' when 'no_match' then 'no_match' when 'assigned' then 'sent'
                       when 'contacted' then 'contacted' when 'lead_status' then 'closed' end as kind,
           b.business_name
      from public.lead_events e
      left join public.listings b on b.id = e.listing_id
     where e.lead_id = p_lead
       and (e.kind in ('received', 'no_match', 'assigned', 'contacted') or (e.kind = 'lead_status' and e.detail = 'closed'))
    union all
    select m.created_at, case m.sender when 'business' then 'message_in' else 'message_out' end, b.business_name
      from public.lead_messages m
      join public.listings b on b.id = m.listing_id
     where m.lead_id = p_lead
  ) x
  where public.is_customer_of_lead(p_lead)
  order by created_at;
$$;

revoke all on function public.send_message(uuid, uuid, text), public.my_conversations(), public.business_conversations(uuid),
  public.conversation_messages(uuid, uuid), public.my_unread_messages(), public.my_request_log(uuid) from public, anon;
grant execute on function public.send_message(uuid, uuid, text), public.my_conversations(), public.business_conversations(uuid),
  public.conversation_messages(uuid, uuid), public.my_unread_messages(), public.my_request_log(uuid) to authenticated;
