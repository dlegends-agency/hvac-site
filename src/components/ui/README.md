# components/ui

## Overview
Small presentational form and button primitives.

## Interface
- `Button.tsx`: `Button`, `buttonClass`.
- `Field.tsx`: `Field`, `SelectWrap`, `inputClass`.
- `CheckboxCards.tsx`: `CheckboxCards`.
- `RadioCards.tsx`: `RadioCards`.

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
