# functions/api

## Overview
Cloudflare Pages Function routes served under `/api`. Each file exports `onRequestGet` or `onRequestPost`. Shared helpers live in [`../_lib`](../_lib/README.md).

## Interface
- `run-discovery.ts`: `onRequestPost` for `POST /api/run-discovery` (bearer token). Lets the admin "Run now" button dispatch the `discovery-agent.yml` GitHub Actions workflow on `ref: "main"`. Returns `{ started: true }`. It declares its own local `Env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`) and `json` helper.

## Subdirectories & Boundaries
- submit: [./submit/README.md](./submit/README.md) - public forms (service request, contact, list your business) with a CAPTCHA check.
- recommend: [./recommend/README.md](./recommend/README.md) - customer recommendations: submit, email confirmation.
- google: [./google/README.md](./google/README.md) - Google Places business linking and live ratings.
- notify: [./notify/README.md](./notify/README.md) - lead alert email sending.
- stripe: [./stripe/README.md](./stripe/README.md) - subscriptions, portal, account history, lead unlock, webhook.

## Invariants
- `run-discovery`: 501 if `GITHUB_TOKEN`/`GITHUB_REPO` or the Supabase vars are missing (the admin page then falls back to queueing for the next scheduled run); 401 without a token; 403 unless Supabase `rpc/is_admin` called as the user returns `true`; 502 if GitHub rejects the dispatch.

## Side Effects
- `run-discovery`: calls Supabase `rpc/is_admin` and the GitHub REST API to trigger a workflow run.

## Verification
- Run: `npm run test:stripe`, `npm run test:google`, `npm run test:notify`, `npm run test:account`, `npm run test:unlock`, `npm run test:recommend`, `npm run test:submit`

## cron/scrapes.ts

`POST /api/cron/scrapes` with header `X-Notify-Secret` starts the permits and bids scrapes that Admin > Schedule says are due (and skips any already running). GitHub's own 30-minute timer often skips hours, so point a free outside timer (cron-job.org, every 15 to 30 minutes, method POST, that header) at it. Needs `NOTIFY_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO` and `SUPABASE_SERVICE_ROLE_KEY` in Cloudflare.
