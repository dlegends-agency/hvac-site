# lib/seo-audit

## Overview
In-browser SEO audit used by the admin SEO page. Loads each site page and analyses it against rules.

## Interface
- `rules.ts`: `analyzePage`, `analyzeRawHtml`, `crossPageIssues`, `normalizePath`, `RULE_LABELS`, types `Severity`, `PageKind`, `Issue`, `PageResult`, `AuditContext`.
- `run.ts`: `runAudit` (async), `issuesToCsv`, `AuditReport`.

## Invariants
- `run.ts` audits with a concurrency pool `POOL = 3` and `PAGE_TIMEOUT_MS = 10000` per page.
- Raw HTML fetches use `cache: "no-store"`.

## Side Effects
- `run.ts:auditInFrame` creates an off-screen same-origin iframe via `document.createElement`.
- `run.ts` calls `fetch` for page HTML and uses `getSupabaseBrowser` (guarded by `isSupabaseConfigured`).

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
