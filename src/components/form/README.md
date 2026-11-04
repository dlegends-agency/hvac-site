# components/form

## Overview
Multi-step lead capture form.

## Interface
- `LeadCaptureForm.tsx`: `LeadCaptureForm`.
- `LeadSteps.tsx`: `IssueStep`, `LocationStep`, `ContactStep`, `DetailsStep`, `ReviewStep`.
- `useLeadForm.ts`: `useLeadForm`, `SubmitStatus`.

## Invariants
- Validation schema and step fields come from `leadSchema` / `stepFields` in `lib/lead-schema.ts`.

## Side Effects
- Submission goes through `lib/submit-lead.ts:submitLead`, which inserts into the Supabase `leads` table.

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
