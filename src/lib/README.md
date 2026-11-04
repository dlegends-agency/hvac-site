# lib

## Overview
Shared non-visual logic: Supabase client and data hooks, domain types, plan entitlements, lead submission, SEO/head helpers.

## Interface
- `supabase.ts`: `isSupabaseConfigured`, `getSupabaseBrowser`.
- `types.ts`: `Lead`, `ContractorLead`, `Post`, `PageView`, `Listing`, `ListingClaim`, `ListingBilling`, `ListingPrivate`, `DiscoveryJob`, `ListingCandidate`, `DiscoveryRun`, `PlanId`, `LeadStatus`, `ListingStatus`, `LEAD_STATUSES`, `CONTRACTOR_LEAD_STATUSES`, `LISTING_STATUSES`.
- `plans.ts`: `activePlan`, `isFeatured`, `isVerified`, `sortByPlan`, `publicView`.
- `listing-images.ts`: `imageUrl`, `uploadListingImage`, `removeListingImage`, `coverCrop`, `IMAGE_RULES` (photos go to the public `listing-images` Storage bucket, resized in the browser first).
- `post-form.ts`: `postForm` (sends a public form to `/api/submit/*` with its CAPTCHA token and the customer's session if signed in).
- `use-google-photo.ts`: `useGooglePhoto` (a paid connected listing's Google photo as its profile picture).
- `recommendations.ts`: `useListingRecommendations`, `Recommendation`.
- `hours.ts`: `DAYS`, `cleanHours`, `hasHours`, `formatTime`, `timeZoneFor`, `openStatus` ("Open now · closes 5:00 PM", by the state's main time zone).
- `google-live.ts`: `fetchGoogleLive` (one `/api/google/rating` request per slug, shared by the stars and the hours on a page).
- `directory.ts`: `usePublishedListings`, `usePublishedListing`, `listingsForLocation`, `LOCATION_PAGE_LIMIT`, `slugify`, `safeUrl`, `safeGoogleUrl`.
- `blog.ts`: `usePublishedPosts`, `usePublishedPost`, `PostSummary`.
- `admin-hooks.ts`: `useLeads`, `usePageViews`, `useLiveQuery`, `useNow`, `useCountUp`, `countBy`, `dailyCounts`.
- `submit-lead.ts`: `submitLead`, `SubmitResult`.
- `lead-schema.ts`: `leadSchema`, `LeadFormValues`, `stepFields`, `stepTitles`.
- `lead-events.ts`: `LEAD_FORM_ID`, `openLeadForm`, `onPreselectIssue`.
- `use-page-meta.ts`: `usePageMeta`; `seo-store.ts`: `recordSeo`, `takeSeo`, `SeoMeta`.
- `schema.ts`: `absolute`, `breadcrumbLd`, `faqLd`, `webPageLd`, `Crumb`.
- `reveal.ts`: `reveal`, `delay`.
- Subdirectory: [seo-audit](./seo-audit/README.md).

## Invariants
- `getSupabaseBrowser` throws if `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are unset; it returns a memoised singleton. Access control is by RLS, not the key.
- `activePlan` returns `free` once a paid plan has passed `plan_until`; `publicView` strips description, services, service_areas, website, email and Google fields from non-featured listings.
- `sortByPlan` is stable and puts featured listings first.
- `seo-store.ts` holds one module-level record; `takeSeo` returns and clears it. `usePageMeta` records only when `document` is undefined (server render).

## Side Effects
- Supabase: `leads` insert (`submit-lead.ts`); `listings`, `posts`, `page_views` queries via hooks.
- `supabase.ts` persists the session in localStorage.
- `use-page-meta.ts` mutates `document.title` and head meta tags.
- `lead-events.ts` uses `window`/`document` for lead-form events.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
