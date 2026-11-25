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

-- The other direction: for one permit or government bid, every local business that reaches it (directory listings by area, claimed or
-- not) and every government vendor matched to it (by NAICS / NIGP code, location and set-aside). Admin > Directory > Bids & permits.
create or replace function public.admin_opportunity_matches(p_kind text, p_item uuid)
returns table (source text, id uuid, name text, city text, state text, phone text, email text, claimed boolean, listing_id uuid, slug text, score int, reasons text[])
language sql stable security definer set search_path = public as $$
  (select 'listing'::text, li.id, li.business_name, li.city, li.state, li.phone, li.email,
          exists (select 1 from public.listing_owners o where o.listing_id = li.id), li.id, li.slug, null::int, null::text[]
     from public.listings li
    where public.is_admin() and li.status = 'published'
      and case when p_kind = 'permit'
            then exists (select 1 from public.public_permits p where p.id = p_item and public.listing_reaches(li.id, p.city, 'TX', p.zip))
            else exists (select 1 from public.gov_bids b where b.id = p_item and public.listing_reaches(li.id, b.city, b.state, b.zip)) end
    order by 8 desc, li.business_name limit 300)
  union all
  (select 'vendor'::text, v.id, v.name, v.city, v.state, v.phone, v.email,
          exists (select 1 from public.listing_owners o where o.listing_id = v.listing_id), v.listing_id,
          (select l2.slug from public.listings l2 where l2.id = v.listing_id), m.score, m.reasons
     from public.vendor_matches m join public.gov_vendors v on v.id = m.vendor_id
    where public.is_admin() and case when p_kind = 'permit' then m.permit_id = p_item else m.bid_id = p_item end
    order by m.score desc limit 300);
$$;
revoke all on function public.admin_opportunity_matches(text, uuid) from public, anon;
grant execute on function public.admin_opportunity_matches(text, uuid) to authenticated;
