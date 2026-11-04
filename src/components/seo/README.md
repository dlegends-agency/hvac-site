# components/seo

## Overview
Visible SEO-supporting UI blocks.

## Interface
- `Breadcrumbs.tsx`: `Breadcrumbs`.
- `FaqList.tsx`: `FaqList`.

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
