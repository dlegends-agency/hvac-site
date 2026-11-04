# functions/api/google

## Overview
Endpoints that connect a contractor's listing to a Google Places business and serve its live star rating. Helpers come from [`../../_lib`](../../_lib/README.md).

## Interface
- `find.ts`: `onRequestPost` for `POST /api/google/find`. Bearer token required. Searches Google for `"<business_name> <city> <state>"` of the caller's owned listing and returns `{ candidates }` (up to 5).
- `link.ts`: `onRequestPost` for `POST /api/google/link` with `{ placeId: string | null }`. Saves `google_place_id` on the caller's listing, or clears it with `null`.
- `photo.ts`: `onRequestGet` for `GET /api/google/photo?slug=<slug>&name=<photo name>`. Public; 302 to Google's short-lived image address for the business's Google photo, only for a paid, connected listing and only for a photo of that same place. `no-store`.
- `rating.ts`: `onRequestGet` for `GET /api/google/rating?slug=<slug>`. Public; returns `{ rating, hours, photo }` (`Rating | null`, `LiveHours | null`: Google's weekday lines and `openNow`) from one Place Details request, with `Cache-Control: no-store`.

## Invariants
- All three return 501 (`find`, `link`) or `{ rating: null, hours: null }` (`rating`) when `GOOGLE_PLACES_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is missing.
- `find` and `link`: 401 without a valid user, 403 without an owned listing, 404 if the listing row is missing.
- `link` rejects a non-null `placeId` that fails `isPlaceId` (400) and one that is not in a fresh search for the listing's own name and city (400), so an account cannot attach someone else's rating. Google failures give 502; a failed save gives 500.
- `rating` validates the slug (`/^[a-z0-9]+(-[a-z0-9]+)*$/`, max 120; otherwise 400) and returns a rating only for a `published` listing with a `google_place_id` and a currently paid plan (`isPaidNow`). Any Places error yields `{ rating: null }`.
- Ratings are never stored or cached.

## Side Effects
- Google Places API requests (every `find`, every `link` with a place, every `rating` hit).
- `link` issues a Supabase `PATCH` on `listings` (`google_place_id`).

## Verification
- Run: `npm run test:google`
