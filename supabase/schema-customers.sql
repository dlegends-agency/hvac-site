-- Run AFTER schema-contractors.sql. Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Customer accounts: a person who asks for HVAC help can sign in and follow their requests (which businesses got it and whether
-- they have been in touch). Requests are linked to the account when the customer is signed in while sending them, and requests sent
-- earlier with the same email address are shown once that email address is confirmed.

alter table public.leads add column if not exists customer_id uuid references auth.users (id) on delete set null;
create index if not exists leads_customer_idx on public.leads (customer_id);
create index if not exists leads_email_lower_idx on public.leads (lower(email));

-- The signed-in customer's own requests. Contractors' private notes are never included; for each business only its public details
-- and whether it has marked the request as contacted.
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
                    'name', b.business_name, 'slug', b.slug, 'city', b.city, 'state', b.state, 'phone', b.phone,
                    'status', a.contractor_status, 'sent_at', a.assigned_at, 'contacted_at', a.contacted_at
                  ) order by a.assigned_at)
             from public.lead_assignments a
             join public.listings b on b.id = a.listing_id and b.status = 'published'
            where a.lead_id = l.id
         ), '[]'::jsonb)
  from public.leads l
  where l.status <> 'spam'
    and auth.uid() is not null
    and (
      l.customer_id = auth.uid()
      -- Older requests with the same email address, but only once the account's email address has been confirmed.
      or lower(l.email) = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    )
  order by l.created_at desc;
$$;

revoke all on function public.my_requests() from public, anon;
grant execute on function public.my_requests() to authenticated;
