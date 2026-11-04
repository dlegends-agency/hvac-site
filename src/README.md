# src Blueprint

## System Overview
Vite + React + TypeScript SPA with prerendering (SSR entry) and a Supabase backend. It serves a public HVAC site and directory, a contractor portal, and an admin panel.

## Local Interface & Invariants
- `main.tsx`: calls `hydrateRoot` if the root has prerendered HTML, otherwise `createRoot(...).render`.
- `App.tsx`: `App` (default) defines all routes; admin and contractor screens are `lazy` loaded.
- `entry-server.tsx`: `render`, `prerenderRoutes` (= `staticRoutes`), `siteUrl`, `brandName`; consumed by `scripts/prerender.mjs`.
- `index.css`: global styles.

## Subdirectories & System Boundaries
- components: [./components/README.md](./components/README.md) - UI, with admin, contractor, directory, form, sections, seo, ui groups.
- config: [./config/README.md](./config/README.md) - static site content and constants.
- lib: [./lib/README.md](./lib/README.md) - Supabase client, data hooks, types, plans, SEO helpers; includes [seo-audit](./lib/seo-audit/README.md).
- pages: [./pages/README.md](./pages/README.md) - route components.

## Global Invariants
- Head data flows through `usePageMeta` and `seo-store` so prerendering can capture it.
- Authorization is expected to be enforced by Supabase RLS (see `lib/supabase.ts`).

## Global Side Effects
- Supabase tables and RPCs listed in the child contracts.
- Server endpoints: `/api/google/*`, `/api/stripe/*`, `/api/run-discovery`.

## System Verification
- Run: `npm run lint` and `npm run build` (`tsc --noEmit` first). No `test` script exists.
