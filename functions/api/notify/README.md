# functions/api/notify

## Overview
Sends new-lead alert emails to contractors. Helpers come from [`../../_lib`](../../_lib/README.md).

## Interface
- `send.ts`: `onRequestPost` for `POST /api/notify/send` with header `X-Notify-Secret`. Returns `{ sent, failed, more }`, where `more` is true when a full batch was claimed.

## Invariants
- 501 unless `NOTIFY_SECRET`, `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` and `SUPABASE_SERVICE_ROLE_KEY` are set; 403 if the secret does not match (`secretsMatch`).
- `BATCH = 25`, because Cloudflare allows 50 outgoing requests per call (1 claim, one send per email, 1 finish).
- Pending alerts are claimed in the database (`rpc/claim_lead_notifications`), so concurrent calls never send the same email twice. One failed email does not stop the others.
- Results are recorded with `rpc/finish_lead_notifications` (`p_sent`, `p_failed`); if recording fails the response is 502 "Sent, but could not record it".
- Safe to call at any time (called by the database after assignment and by a scheduled workflow as a safety net).

## Side Effects
- Sends emails through Resend.
- Supabase RPC calls that mark notifications as sent or failed.

## Verification
- Run: `npm run test:notify`
