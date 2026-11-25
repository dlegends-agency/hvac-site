-- Admin > Directory > a listing: which permits and government bids reach this business (the same area rules the contractor's
-- Opportunities page uses), and whether it unlocked them. Admins only. Safe to re-run. Run in Supabase: SQL Editor > New query > paste > Run.
create or replace function public.admin_listing_opportunities(p_listing uuid)
returns table (kind text, item_id uuid, title text, city text, state text, happened_on date, unlocked boolean)
language sql stable security definer set search_path = public as $$
  (select 'permit'::text, p.id, p.summary, p.city, 'TX'::text, p.issued_on,
          exists (select 1 from public.opportunity_unlocks u where u.listing_id = p_listing and u.kind = 'permit' and u.item_id = p.id)
     from public.public_permits p
    where public.is_admin() and p.trade = 'HVAC' and public.listing_reaches(p_listing, p.city, 'TX', p.zip)
    order by p.issued_on desc nulls last limit 200)
  union all
  (select 'bid'::text, b.id, b.title, b.city, b.state, b.posted_at::date,
          exists (select 1 from public.opportunity_unlocks u where u.listing_id = p_listing and u.kind = 'bid' and u.item_id = b.id)
     from public.gov_bids b
    where public.is_admin() and public.listing_reaches(p_listing, b.city, b.state, b.zip)
    order by b.posted_at desc nulls last limit 200);
$$;
revoke all on function public.admin_listing_opportunities(uuid) from public, anon;
grant execute on function public.admin_listing_opportunities(uuid) to authenticated;
