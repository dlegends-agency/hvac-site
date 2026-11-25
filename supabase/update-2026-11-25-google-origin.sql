-- Allow candidates found through the Google Places API.
alter table public.listing_candidates drop constraint if exists listing_candidates_origin_check;
alter table public.listing_candidates add constraint listing_candidates_origin_check check (origin in ('web', 'osm', 'google'));
