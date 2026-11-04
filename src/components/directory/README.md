# components/directory

## Overview
Public contractor directory UI.

## Interface
- `ListingCard.tsx`: `ListingCard`, `telHref`.
- `CityListings.tsx`: `CityListings`.
- `Rating.tsx`: `FeaturedBadge`, `VerifiedBadge` (paid plan and approved owner), `LicenseBadge` ("License no. provided" or "License verified"), `GoogleReviews`.
- `ListingSidebar.tsx`: `ListingSidebar` (sticky right column: Google map embed, address with directions, phone, website, email, hours), `mapQuery`, `embedUrl`, `directionsUrl`.
- `Hours.tsx`: `HoursSection` (own hours, else Google's live hours for a paid connected listing), `OpenNow`.
- `Recommendations.tsx`: `Recommendations` (approved list, given as `items`, and the form that posts to `/api/recommend/submit`).
- `FeaturedRecommendation.tsx`: `FeaturedRecommendation` (the one recommendation the business features above About us; paid plan).
- `SimilarBusinesses.tsx`: `SimilarBusinesses` (same city, with recommendation counts).

## Invariants
- None

## Side Effects
- `Rating.tsx:GoogleReviews` and `Hours.tsx:HoursSection` call `/api/google/rating?slug=...` through `fetchGoogleLive`.
- `Recommendations.tsx` posts to `/api/recommend/submit` (the list is read by `useListingRecommendations` from the `listing_recommendations_public` view); `SimilarBusinesses.tsx` reads `listing_recommendation_counts`.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
