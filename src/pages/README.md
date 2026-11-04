# pages

## Overview
Route-level page components wired in `src/App.tsx`. Each is a default export.

## Interface
- Public: `HomePage`, `ServicesIndexPage`, `ServicePage`, `LocationPage`, `ContactPage`, `PricingPage`, `BlogIndexPage`, `BlogPostPage`, `PrivacyPage` (plus named `LEGAL_UPDATED`), `TermsPage`, `NotFoundPage`.
- Directory: `DirectoryPage`, `ListingPage`, `AddBusinessPage`.
- `AdminLoginPage`.

## Invariants
- None

## Side Effects
- `ContactPage` inserts into Supabase `contact_messages`; `AddBusinessPage` inserts into `listings`.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
