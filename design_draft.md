# HVACHelp Development Plan (first deliverable, pre-code)

* **Author:** Cyryl Bitangcol
* **Date:** 2026-11-03
* **Status:** Draft for approval. No application code or database has been changed.
* **Baseline:** commit `c9eab59` (unchanged since `existing_state_inventory.md`). Inputs read: `concepts_brief.md`, `existing_state_inventory.md`, `2026-11-03_DRIFT_REPORT.md`, `supabase/schema.sql`, `supabase/schema-contractors.sql`, `functions/api/stripe/unlock.ts`, `src/lib/submit-lead.ts`, `supabase/tests/routing.test.mjs`.
* **Not found:** no EGM review report exists in the repo (`concepts_brief.md` records that six reviewer lenses ran, but no report file was saved). Nothing here relies on one.

Naming: your message calls website leads "Channel 1" and external discovery "Channel 2". `concepts_brief.md` uses the opposite numbers. This plan avoids the numbers and says **website leads** and **external prospects**.

Tags: **[VERIFIED]** read in code this session. **[REPORTED]** from the brief or a reviewer, not re-read by me. **[UNVERIFIED]** cannot be known from the repo.

---

## 1. Conflicts between the approved concept and the existing application

| # | Approved concept | What the code does | Consequence |
|---|---|---|---|
| C1 | NO PERMISSION, NO SALE on every path | **[VERIFIED]** `leads_route_after_insert` routes every new lead except `status='spam'` (`schema-contractors.sql:343-360`). `route_lead` has no eligibility input. | Gate does not exist. |
| C2 | Gate also covers manual assignment, resend, free unlock, paid unlock | **[VERIFIED]** The admin policy on `lead_assignments` is `for all` (`:173-175`), so an admin can insert or update rows directly. `admin_route_lead` calls `route_lead` with no check. `unlock_lead` updates any existing assignment (`:441-455`). `unlock.ts` checks only that an assignment exists and is not already unlocked. | The gate must sit on the `lead_assignments` table and in `unlock_lead`, not only in `route_lead`. A check in `route_lead` alone would leave manual assignment and unlock open. |
| C3 | Source tracking controlled by the server | **[VERIFIED]** `submitLead` sends `source` from the browser (`submit-lead.ts:15`), and the insert policy only checks `status='new'` (`schema.sql:63-66`). Any caller with the public key can set `source` to anything. | Provenance cannot be trusted today. |
| C4 | Complete customer consent records | **[VERIFIED]** Two booleans: `referral_acknowledgment` and `marketing_consent`. No timestamp, wording version, page, or IP. | Consent evidence is thin. |
| C5 | Duplicate detection | **[VERIFIED]** Only `idempotency_key unique`. | No phone, email or address match. |
| C6 | Never expose contact info before unlock | **[VERIFIED]** `my_leads()` returns `first_name`, `last_name` and `issue` before unlock (`:397`); everything else is blank. Matches the product copy, but the name is personal data. | Fine for website leads. For external prospects the preview must be weaker (name withheld). |
| C7 | Customer confirmation emails | **[VERIFIED]** Email exists for contractor alerts only (`lead_notifications`). | New work. Needs customer consent wording first. |
| C8 | Reliable Stripe unlock, failure handling | **[REPORTED]** Webhook ignores the boolean result of `unlock_lead`, so paid-but-not-unlocked can look like success. **[VERIFIED]** `webhook.ts:72` runs `JSON.parse` outside the `try`. | Needs a payment-event log and a failed-unlock list. |
| C9 | Routing and notification errors visible to admin | **[VERIFIED]** `leads_auto_route` and `queue_lead_notification` catch all errors and discard them (`:350-354`, `:523-525`). | Silent failures; no log table. |
| C10 | Refunds and credits | **[VERIFIED]** `lead_assignments` has no refund state. **[REPORTED]** Webhook does not handle refunds or disputes; product copy says unlocks are not refundable. | New work, plus a contractor-facing policy text change. |
| C11 | Equal external-lead access for Free and Featured, existing distribution rules kept | **[VERIFIED]** `route_lead` ranks paid listings first (`:332`: `is_paid desc`). | Paid accounts are served before free ones when slots are limited. This is a priority in the **existing** rule, which you said to preserve. For external prospects it means Featured gets first pick of the 3 slots, which is not "equal access" in a strict reading. I keep the rule unchanged for website leads. For external prospects I need your decision (Question Q-A below). I did not change it. |
| C12 | "Use database migrations" | **[VERIFIED]** There is no `supabase/migrations/` folder and no migration tracking. Schema is hand-run SQL files that re-run themselves. `schema-discovery.sql:9` drops `listings.google_place_id`, so re-running files out of order loses data. | Introduce numbered, additive migration files and a small applied-migrations table. Never edit the existing files. |
| C13 | Featured = enhanced profile + discounted unlock | **[REPORTED]** Photos on Featured profiles are in the concept and not in the code. | Phase 4 item, not blocking. |
| C14 | Per-source pricing "evaluated separately" | **[VERIFIED]** Price is fixed in two code places (`stripe.ts:22`, `pricing.ts`); `unlock_lead` takes the price as a parameter. | Keep flat $10/$5 for all leads until evaluated. Add a nullable per-source price column only when you ask for it. |

No business decision in your message is changed by this plan. C11 is the one place where a stated decision (equal access) and a stated instruction (preserve existing rules) pull apart.

## 2. Current application readiness assessment

**Built in code, tested only offline [VERIFIED/REPORTED]:** request form with honeypot and Zod validation; `leads` insert-only public policy; `route_lead` (city and ZIP radius, cap 3); `lead_assignments`; `my_leads()` masking; Stripe subscriptions, per-lead Checkout, webhook, portal; Resend alert queue with a 10-minute backup job; claims queue and listing editor; admin leads pages; contractor portal; discovery agent for contractors. Offline tests exist for routing SQL (PGlite), Stripe, unlock, notify, account and Google. `scripts/README.md` reports they pass; I have not re-run them.

**Needs repair before more is built on it:** C1 to C5, C8, C9, C10 above; the routing test harness uses a simplified `leads` table with no source, consent, constraints, or public policy, so a gate would not be properly tested until it is extended **[REPORTED, matches test file header lines 14-20 which I read]**.

**Incomplete:** customer emails, refunds, failed-payment list, contractor performance, availability, service-based matching, locations in the database, platform configuration, business verification beyond admin approval.

**[UNVERIFIED], cannot be answered from the repo:**

| ID | Question | Why it blocks |
|---|---|---|
| U1 | Is `schema-contractors.sql` (and the five files before it) applied on the live Supabase project? | Every phase assumes the current schema. |
| U2 | Is `zip_centroids` loaded (~33,800 rows)? | Without it routing falls back to city text match. |
| U3 | Are Stripe test prices, the webhook endpoint, and the portal configured? Has one test unlock ever completed? | Phase 1 payment work cannot be tested against a real webhook otherwise. |
| U4 | Are Resend, `NOTIFY_SECRET`, `NOTIFY_FROM_EMAIL`, the `notification_settings` row, and the GitHub `NOTIFY_SECRET` set? | Notifications and customer emails. |
| U5 | How many contractors have approved listings and owners, and in which cities? | A lead in a city with no contractor earns nothing. |
| U6 | Does the live `leads` table have any rows, and any with an odd `source`? | Backfill design. |

I cannot answer U1 to U6. Doing so needs read-only access to Supabase, Stripe (test mode) and Cloudflare, which I have not been given and have not tried to use (`.env.local` exists; I did not open it). Phase 0 below gives a read-only checklist you can run.

## 3. Roadmap and prioritized tasks

Each phase ends with a completion report and waits for your go-ahead. Order follows your priorities; the "Depends on" column shows what must exist first.

| Phase | Goal | Depends on |
|---|---|---|
| 0 | Verify live state (read-only) and re-run offline tests | none |
| 1A | Gate and provenance: server-written source, consent record, eligibility columns, gate on `lead_assignments` and `unlock_lead`, extended test harness | Phase 0 |
| 1B | Observability: routing log, notification and payment-event logs, admin "failed" views, backfill | 1A |
| 1C | Payments: reliable unlock, failure handling, refund and credit | 1A, 1B, decision Q-C |
| 1D | Duplicates and customer confirmation email | 1A, decision Q-D |
| 2 | External prospect staging table, review workflow, promotion function | 1A to 1C |
| 3 | Customer discovery agent (separate from the contractor agent) | 2, lawyer review of each source |
| 4 | Marketplace improvements | 1 |
| 5 | Admin dashboard views (built incrementally with each phase, finished here) | 1 to 4 |

Task list in priority order:

1. P0-1 Read-only live checks (U1 to U6). P0-2 Re-run offline tests and record results.
2. P1A-1 Migration scaffold: `supabase/migrations/` and a `schema_migrations` table. P1A-2 Add `lead_origin`, `eligibility`, `eligibility_reason`, consent evidence columns to `leads`. P1A-3 Server-written provenance. P1A-4 `lead_is_sellable(lead_id)` function. P1A-5 Gate trigger on `lead_assignments` insert and on unlock update; gate inside `route_lead`, `unlock_lead`, `my_leads()`. P1A-6 `unlock.ts` checks eligibility and returns a clear error. P1A-7 Extend the routing test harness to the real `leads` definition and add gate tests.
3. P1B-1 `routing_log` (one row per route attempt: lead, result count, reason, error). P1B-2 Stop swallowing errors in `leads_auto_route` and `queue_lead_notification`: still never block the lead save, but write the error to the log. P1B-3 `stripe_events` table (event id, type, outcome, error). P1B-4 Admin lists: eligible leads with zero assignments, notifications with errors, payments with no unlock.
4. P1C-1 Webhook: parse inside `try`, record every event, act on the boolean result of `unlock_lead`. P1C-2 `refund_state`, `refunded_at`, `refund_reason`, `credit_cents` on `lead_assignments`. P1C-3 Admin action: issue Stripe refund or credit. P1C-4 Handle `charge.refunded` and dispute events. P1C-5 Contractor-visible policy text and a change to the "not refundable" copy.
5. P1D-1 Duplicate key on normalized phone and email within a window; link, never delete. P1D-2 Customer confirmation email through the existing Resend path.
6. P2 onward: see section 4.

## 4. Database migration plan

Rules: additive only; nullable or defaulted new columns; no rename or drop; each file idempotent; database first, frontend second, so the old frontend keeps working at every step; never edit `schema*.sql`.

| File (proposed) | Contents | Backward compatibility |
|---|---|---|
| `supabase/migrations/0001_migration_log.sql` | `schema_migrations(name, applied_at)` | New table only. |
| `0002_lead_provenance.sql` | `leads`: `lead_origin text`, `eligibility text`, `eligibility_reason text`, `consent_at timestamptz`, `consent_version text`, `consent_page text`, `consent_ip text`, `consent_user_agent text`. Backfill existing rows: origin `website_form`, eligibility `eligible` (every existing row already has `referral_acknowledgment = true` by constraint). New columns are nullable at first; checks are added after the backfill is verified. | Old frontend inserts still succeed until the public insert policy is removed in the final step of Phase 1A (see Q-B). |
| `0003a_remove_public_insert.sql` | Drops policy "Anyone can submit a lead" on `leads`. Run only after `/api/leads/submit` is live and one real submission is verified. Rollback statement stored alongside. | **Breaks the old frontend by design.** Not backward compatible; this is the one exception to the additive rule. |
| `0003_lead_gate.sql` | `lead_is_sellable()`; before-insert/update trigger on `lead_assignments`; updated `route_lead`, `unlock_lead`, `my_leads()`; `eligibility` filter. | Existing eligible rows behave exactly as today. |
| `0004_logs.sql` | `routing_log`, `stripe_events`, admin read policies, no public policies. | New tables. |
| `0005_refunds.sql` | refund/credit columns on `lead_assignments`; admin function to record a refund. | Nullable columns. |
| `0006_duplicates.sql` | normalized phone/email columns or index; `duplicate_of uuid`. | Nullable. |
| `0007_prospects.sql` (Phase 2) | `prospects`, `prospect_sources`, `prospect_events`, `aggregate_counts` view; `promote_prospect()`. | New tables. External rows never touch `leads` until promoted. |
| `0008_discovery_customers.sql` (Phase 3) | job, run, daily-limit, cost and kill-switch tables for the customer agent, separate from the contractor agent's tables. | New tables. |

RLS: all new tables enable RLS; default no policy; admin policy via `is_admin()`; contractors reach data only through security-definer functions that already hide fields. Service-role-only functions are revoked from `anon` and `authenticated` as `unlock_lead` is today.

Open design points for Phase 1A are in section 7.

## 5. Security and permission enforcement plan

* **Single definition of sellable.** `lead_is_sellable(lead)` is true only when `eligibility = 'eligible'` and the lead is not spam, and, for external-origin rows, they came through `promote_prospect()`. Everything else calls this function.
* **Enforced at four layers:** (1) `route_lead` skips ineligible leads; (2) a before-insert trigger on `lead_assignments` rejects any row for an ineligible lead, so admin manual add and direct inserts fail; (3) `unlock_lead` returns false and logs when ineligible; (4) `unlock.ts` rejects before creating a Stripe Checkout session. `my_leads()` also filters, as a last barrier.
* **Free unlock by admin** goes through `unlock_lead`, so it is gated too.
* **No client-trusted fields.** `lead_origin`, `eligibility`, `consent_*` and `source` for new rows are written by the database or server. Client `source` is kept only as a free-text page label in a separate column and never used for decisions. Where the write happens is Decision Q-B.
* **Contact data.** `my_leads()` keeps masking. A new function for external prospects will not return `first_name`/`last_name` before unlock.
* **Secrets** stay in Cloudflare and GitHub secrets; no new secret is placed in the repo.
* **Spam and abuse.** The README says the form has no rate limit or Turnstile. Not in scope unless you add it; flagged as a risk.
* **No AI calls** in Phases 0 to 2. Phase 3 uses keyword and rule filters first; a model call only on records that pass them, behind the daily cap and kill switch.

## 6. Testing plan

* Extend `supabase/tests/routing.test.mjs` so its stub `leads` table mirrors the real columns, constraints and public insert policy (today it does not).
* New SQL tests: web-form lead routes as before; ineligible lead gets no assignment from `route_lead`, `admin_route_lead`, direct admin insert, `unlock_lead`; `my_leads()` never returns it; client-supplied `source`/`lead_origin` is overwritten; consent fields are set; duplicate by phone is linked, not deleted; refund changes assignment state; re-running every migration twice is safe.
* Function tests in the existing style (mocked `fetch`): `unlock.ts` rejects ineligible leads; webhook with invalid JSON, duplicate event, failed `unlock_lead`, refund event.
* Regression: keep `test:stripe`, `test:google`, `test:notify`, `test:account`, `test:unlock`, `discover:test` green; run `npm run lint` and `npm run build` (`tsc --noEmit`) at the end of each phase.
* The PGlite package must be installed (`npm i --no-save @electric-sql/pglite`); that needs network and is not installed now, so the routing test has not been run by me.
* Stripe test mode: one real checkout and one refund by hand per phase that touches payments. No browser end-to-end suite exists; adding one is not planned.

Acceptance checks from `concepts_brief.md` ("Acceptance checks for the first schema release", 1 to 9) are adopted as the Phase 1A exit list.

## 7. Deployment and rollback plan

* Order: apply migration to a Supabase **branch or a copy** first if one exists (otherwise state that none exists and apply to production in a quiet window after a manual backup/export); then deploy Cloudflare code; then enable features. Never the reverse.
* Every migration file ships with a written rollback note. Additive changes are rolled back by leaving the columns unused and reverting code; the gate trigger gets a one-line `drop trigger` rollback; replaced functions are saved as the previous version in the same migration folder.
* Feature switches: a row in a `platform_flags` table (or the existing `notification_settings` pattern) for `gate_enforced`, `customer_confirmation_email` and (Phase 3) `discovery_enabled`. Gate enforcement is switched on only after the backfill is checked.
* Verification after each deploy: send one test lead; confirm assignment, alert email, unlock in Stripe test mode, and that an ineligible test lead gets none.
* Cloudflare Pages keeps previous deployments, so a frontend rollback is a redeploy of the prior build.
* No destructive SQL (`drop`, `truncate`, unscoped `delete`/`update`) will be run without your explicit approval of the exact statement.

## 8. Dependencies and blockers

| Blocker | Needed from you | Affects |
|---|---|---|
| U1 to U6 live-state facts | Run the read-only checklist (below) or give read-only access | Phase 0 sign-off, all phases |
| ~~Q-A external lead priority (C11)~~ | Decided: no paid preference for external | Phase 2 routing |
| ~~Q-B where server-written fields are set~~ | Decided: Cloudflare Function `/api/leads/submit` | Phase 1A design |
| Q-C refund/credit policy: reasons, window, refund vs credit | Decision | Phase 1C |
| Q-D customer confirmation email wording and consent text | Decision, ideally with lawyer sign-off | Phase 1D |
| Lawyer review of each external source and the contact rules | Lawyer named, date set | Phase 2 promotion and all of Phase 3. Nothing external is sold or contacted before this. |
| Source list with terms URL, access method, resale yes/no | Owner and lawyer | Phase 3 |
| Contractor supply per city | Count from U5 | Whether external leads can earn anything |

**Phase 0 read-only checklist (you run in the Supabase SQL Editor; none changes data):**
`select count(*) from zip_centroids;` ; `select count(*) from leads;` ; `select source, count(*) from leads group by 1;` ; `select count(*) from listing_owners;` ; `select plan, status, count(*) from listings group by 1,2;` ; `select proname from pg_proc where proname in ('route_lead','unlock_lead','my_leads','claim_lead_notifications');` ; `select count(*) from lead_assignments where unlocked_at is not null;` ; `select count(*) from lead_notifications where sent_at is null;` ; `select * from notification_settings;` (do not paste the secret). Stripe test mode: confirm two prices, a webhook endpoint with five events, and the portal enabled. Cloudflare: confirm the variable names listed in `README.md` exist (names only).

## 9. Recommended first implementation phase

**Phase 0, then Phase 1A (gate and provenance), as two separate steps.**

Reasons: the gate is the rule every later phase depends on (external prospects, payments, admin tools); it is additive and keeps website leads behaving as today; and it can be tested fully offline once the test harness mirrors the real table. Phase 1A does not need the payment or lawyer decisions. Phase 1C waits for Q-C. Nothing in Phase 2 or 3 should start before 1A to 1C pass.

## 10. Risks to carry

* Live state unknown (U1 to U6): a plan built on code that is not deployed.
* Payments and email have never run live, so Phase 1 may expose faults in setup, not just code.
* Legal and platform-terms exposure for anything external; this plan gives no legal conclusion.
* The gate trigger on `lead_assignments` will also block any existing flow that inserts there for a lead not marked eligible; the backfill must be verified before enforcement.
* Admin workload: external prospect review and contractor claims are manual.
* Contractor cap of 3 per lead is kept as you asked; the brief flags it as a possible issue for external prospects (a person who posted publicly did not expect three paid calls). It is your decision, not changed here.

## 11. Decisions needed

* **Q-A DECIDED by author (2026-11-03): no paid preference for external prospects.** Slots are filled by local match, then longest since last lead, then nearest. Website-lead routing keeps its current order (paid first) and is not changed. Consequences: external prospects need their own ordering path (a parameter or a separate function that `route_lead` does not share), with a test that Free and Featured listings in the same city are treated alike. Unlock price is still $10 Free / $5 Featured. This resolves conflict C11.
* **Q-B DECIDED by author (2026-11-03): Option 2, a Cloudflare Pages Function `/api/leads/submit`.** The function inserts with the service role and writes `source`, `lead_origin`, consent evidence (timestamp, wording version, page, IP, user agent). The public insert policy on `leads` is then removed. Consequences recorded for Phase 1A:
  * Deployment order changes: this step cannot be fully database-first. Order is (1) additive migration for the new columns, (2) deploy the function, (3) deploy the frontend that calls it, (4) verify a live submission, (5) only then remove the public insert policy. Between steps 1 and 4 the old frontend keeps working.
  * Failure mode accepted: if the function is down or misconfigured, no leads save. Mitigation: a health check, an alert on zero submissions in a set window, and keeping the old policy until step 4 is verified. Rollback: re-create the policy (one statement, kept in the migration folder).
  * Needs `SUPABASE_SERVICE_ROLE_KEY` (already used by other functions) in the Pages environment for this endpoint.
  * Rate limiting or Turnstile becomes possible at the same endpoint but is not in scope unless you add it.
  * The database gate (`lead_is_sellable`, trigger on `lead_assignments`, `unlock_lead`) is still required. The function protects intake only; it does not protect assignment or unlock.
  * Client-sent `source` is accepted only as a free-text page label, validated against a short allowed list, and never used for decisions.
* **Q-C** refund policy, **Q-D** customer email wording: asked when Phase 1C and 1D are reached, not now.

Q-B is decided. Q-A is asked next, then Q-C and Q-D when their phases are reached, one at a time.
