# components/admin

## Overview
Admin panel (routes under `/admin`): leads, blog posts, listings, discovery, claims, messages, SEO audit, analytics.

## Interface
- `PanelLayout` (default export), `AdminShell`, `LoginForm`.
- Screens: `OverviewDashboard`, `LeadsList`, `LeadDetail`, `PostsList`, `PostEditor`, `ListingsAdmin`, `ListingEditor`, `DirectoryTabs`, `DiscoveryAdmin`, `ClaimsAdmin`, `MessagesAdmin`, `SeoAudit`, `AnalyticsReport`.
- `widgets.tsx`: `PageTitle`, `StatCard`, `Panel`, `StatusBadge`, `BarList`, `DailyChart`, `QueryState`.

## Invariants
- `App.tsx` lazy-loads these screens expecting named exports, except `PanelLayout` (default).

## Side Effects
- Supabase tables `leads`, `posts`, `listings`, `listing_candidates`, `listing_claims`, `listing_billing`, `listing_private`, `listing_owners`, `discovery_jobs`, `discovery_runs`, `discovery_rejected`, `contact_messages`, `page_views`, `admin_users`; RPC `admin_route_lead`; `supabase.auth` in `AdminShell` and `DiscoveryAdmin`.
- `DiscoveryAdmin` calls `/api/run-discovery`.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.

## Request flow
- `FlowHealth.tsx`: `FlowHealth` (stuck-request tiles on Overview and Logs), `FlowLogs.tsx`: `FlowLogs` (route `/admin/logs`), `LeadTimeline.tsx`: `LeadTimeline` (one request's steps on its lead page). All read `lead_events` and the `admin_*` functions from `supabase/schema-flow.sql`.
