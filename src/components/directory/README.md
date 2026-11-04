# components/directory

## Overview
Public contractor directory UI.

## Interface
- `ListingCard.tsx`: `ListingCard`, `telHref`.
- `CityListings.tsx`: `CityListings`.
- `Rating.tsx`: `FeaturedBadge`, `VerifiedBadge` (paid plan and approved owner), `LicenseBadge` ("License no. provided" or "License verified"), `GoogleReviews`.
- `Hours.tsx`: `HoursSection` (own hours, else Google's live hours for a paid connected listing), `OpenNow`.
- `Recommendations.tsx`: `Recommendations` (approved list and the form that posts to `/api/recommend/submit`).
- `SimilarBusinesses.tsx`: `SimilarBusinesses` (same city, with recommendation counts).

## Invariants
- None

## Side Effects
- `Rating.tsx:GoogleReviews` and `Hours.tsx:HoursSection` call `/api/google/rating?slug=...` through `fetchGoogleLive`.
- `Recommendations.tsx` reads the `listing_recommendations_public` view and posts to `/api/recommend/submit`; `SimilarBusinesses.tsx` reads `listing_recommendation_counts`.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
