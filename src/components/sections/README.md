# components/sections

## Overview
Landing-page sections composed by pages in `src/pages`.

## Interface
- `HeroSection`, `BenefitsSection`, `HowItWorks`, `EmergencySituations`, `ServiceGrid`, `ServiceAreaSection`, `FAQAccordion`, `FinalCTA`, `LeadSection`, `DirectoryPromo`, `SectionHeading` (each exported from the same-named `.tsx` file).

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
