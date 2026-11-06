# components/contractor

## Overview
Contractor portal (routes under `/contractor`): login, leads, business profile, billing, account, listing claim and Google connection.

## Interface
- Default exports: `ContractorLayout`, `ContractorHome`, `ContractorLeads`, `ContractorBusiness`, `ContractorBilling`, `ContractorAccount`, `ContractorLoginPage`.
- Named: `ContractorMessages` (route `/contractor/messages`), `PerformancePanel` (last-30-days funnel, spend and speed), `LeadHistory` (one lead's steps for this business), `ClaimListing`, `ConnectGoogle`, `HoursEditor`, `PhotosPanel` (profile picture and cover photo upload; paid plan).
- Default export `ContractorRecommendations` (route `/contractor/recommendations`): the business shows or hides each customer recommendation and features one (paid plan), through `my_recommendations`, `decide_my_recommendation` and `feature_my_recommendation`.
- `api.ts`: `callApi`, `ApiResult`.
- `context.ts`: `ContractorContext`, `useContractor`, `ContractorState`.
- `useMyLeads.ts`: `useMyLeads`, `ago`.

## Invariants
- `callApi` never throws; failures return `status: 0, error: "network"`. It sends the current Supabase session token as a Bearer header.

## Side Effects
- POSTs via `callApi`: `/api/google/link`, `/api/google/find`, `/api/stripe/account`, `/api/stripe/portal`, `/api/stripe/unlock`.
- Supabase tables `listings`, `listing_claims`, `listing_owners`, `listing_private`, `listing_billing`, `lead_assignments`; RPCs `my_leads`, `update_my_lead`, `set_my_email_alerts`; `supabase.auth` in `ContractorLayout`.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
