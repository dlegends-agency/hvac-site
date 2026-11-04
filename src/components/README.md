# components

## Overview
React UI. Top-level files are shared site chrome and behavior helpers; feature groups live in subdirectories.

## Interface
- `Header`, `Footer`, `Logo`, `MobileNavigation`, `LegalLayout` (+ `LegalSection`), `Markdown`, `ServiceCard`, `OpenFormButton`, `CopyrightYear`.
- Behavior components: `PageViewTracker`, `ScrollManager`, `RevealManager`.
- Subdirectories: [admin](./admin/README.md), [contractor](./contractor/README.md), [directory](./directory/README.md), [form](./form/README.md), [sections](./sections/README.md), [seo](./seo/README.md), [ui](./ui/README.md).

## Invariants
- None

## Side Effects
- `PageViewTracker` stores a session id in localStorage (`hvac_sid`) and inserts into the Supabase `page_views` table.
- `ScrollManager` and `RevealManager` use `window`/`document`.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
