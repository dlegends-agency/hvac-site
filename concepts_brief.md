# Concept Brief: HVACHelp Two-Channel Lead Acquisition and Marketplace

**Author:** Cyryl Bitangcol
**Date:** 2026-11-03
**Mode:** Brainstorm. Six reviewer lenses: design, codebase-details, zoom-out, comprehension, implementation-readiness, structural. All six ran.
**Baseline:** `existing_state_inventory.md`, checked 2026-11-03, commit `c9eab59`. Any later commit makes it stale.

Tags used below: **[EXISTS]** in the repository (not the same as live), **[PROPOSED]** new work, **[UNVERIFIED]** not confirmed, **[OPEN]** needs a decision or data.

No legal conclusions are given in this brief. Every legal point is a question for a qualified Texas lawyer.

---

## Overview

HVACHelp is one platform with three parts:

1. A Texas HVAC contractor directory. Free profile shows limited information. Paid Featured plan shows more.
2. A contractor lead marketplace. Contractors receive customer inquiries and pay to unlock contact details.
3. A lead discovery agent.

The decision is to use two lead channels at once:

- **Channel 1, external discovery.** An agent finds people who appear to be looking for HVAC service in permitted sources (approved APIs, permitted public search and community pages, licensed lead providers). It records source, URL, date found, location, service, intent, freshness, contact permissions and duplicates.
- **Channel 2, website lead generation.** SEO, Texas city and emergency pages, Google Ads and the inquiry form. Customers submit requests themselves.

Both channels are meant to feed the existing distribution system. For an external lead: check source, location, service, freshness, duplicate status and contact permission. Only a lead with valid permission for the intended use becomes a sellable individual lead. It is matched to registered contractors, who see a limited preview and pay to unlock contact details. HVACHelp tracks the transaction, the contractor response and the outcome. If a source does not permit individual contact or resale, that person's information is never sold. The source may be used only for aggregate demand figures.

**Working assumption to test:** Channel 1 starts with a few sources whose terms clearly allow this use and widens only after that works. The current schema, routing, dashboards and Stripe unlock are reused. New: source and consent fields, a quality score, cross-source duplicate detection, outcome tracking, and the agent.

**Summary of review findings.** The reviewers did not reject the concept. They agreed on three points:

- The order is risky. Channel 2 and contractor supply are not proven, and the existing payment and email chain has never run live.
- The "reuse" assumption is only partly true. The code has no gate that stops an unpermitted lead from being routed and sold.
- Individual-lead sales from external sources depend on a legal review that has not happened.

---

## Analysis

### A1. What exists today (per inventory) and what it means for this concept

| Capability | State | Gap that matters here |
|---|---|---|
| Request form with consent checkbox and honeypot | [EXISTS] Built | No customer confirmation, no phone or email verification, no customer record |
| `leads` table | [EXISTS] | See "Code findings" below. Built for first-party form leads |
| `route_lead` (up to 3 contractors; paid first, local, rotation, nearest) | [EXISTS] Built, tested offline | Ignores services offered and availability; no source or quality input |
| `lead_assignments` (status, notes, unlock payment) | [EXISTS] | `source` column there means auto/manual assignment, not lead origin |
| Per-lead unlock ($10 Free, $5 Featured) via Stripe | [EXISTS] Built, never run with real or test payment | No refunds, no dispute handling |
| Admin lead list, detail, manual assign, unlock free | [EXISTS] | Manual tools can bypass any future sellable gate |
| Analytics with traffic sources | [EXISTS] | Ad spend not tracked |
| Location pages | [EXISTS] Partly | Texas plus 4 cities, in code (`src/config/locations.ts`) |
| Discovery agent | [EXISTS] | Finds contractor businesses, not customers. Does not read community sites |
| ZIP table (~33,800 rows) | [UNVERIFIED] | Not confirmed as loaded |

**Not built and relevant:** refunds, failed-payment list, customer record, contractor performance reports, availability, service-based matching, platform configuration (prices, cap of 3 and radius limits live in code or SQL), photos on Featured profiles (the inventory does not list photos; the concept does).

**Unverified at baseline [UNVERIFIED]:**

- U1. Latest SQL has been run on the live Supabase project.
- U2. ZIP table is loaded.
- U3. Stripe prices, webhook and portal are set up and work.
- U4. Resend and the related Cloudflare and database settings are set up.
- U5. Google ratings key (not needed for this feature).
- U6. Any real contractor has used the portal. Contractor count and traffic are unknown.
- U7. How many Texas contractors have agreed to use the platform (the owner has not said).

Anything below that depends on U1 to U4 and U6 inherits that doubt.

### A2. Code findings (codebase and readiness reviewers read the code)

1. **Every inserted lead is routed at once.** An after-insert trigger calls `route_lead` for every row except `status = 'spam'`. Contractors are then emailed. Nothing checks permission or source. The claim "only permitted leads become sellable" is not true of the current code. Admin re-send, manual assign and free unlock also have no gate, and `unlock.ts` checks neither lead status nor consent.
2. **`leads` is shaped for form leads.** Street, phone, email, first and last name, postal code, city, state, property type, property status and contact method are NOT NULL. `referral_acknowledgment` must be true. A found-in-the-wild lead would need placeholders or a false acknowledgment, which would record a consent that never happened.
3. **`leads.source` exists but cannot be trusted.** It is free text, and the public insert policy lets any caller with the public key set it to any value. Provenance needs a server-written field.
4. **Consent record is thin.** Two booleans, with no timestamp, wording version, URL or IP.
5. **Duplicate protection is minimal.** Only a one-request idempotency key. No match by phone, email, address or time window. Duplicates against `leads` do not exist anywhere in the code.
6. **No refunds.** The product copy says unlocked requests are not refundable. `lead_assignments` has no refund state. The Stripe webhook does not handle refunds or disputes.
7. **Silent failures.** Routing and notification errors are swallowed. A failed route leaves a lead with no contractors and no signal. The webhook ignores whether `unlock_lead` actually unlocked, so paid-but-not-unlocked can look like success.
8. **Existing agent is reusable only as scaffolding.** Reusable: job queue, run log, GitHub Actions schedule, robots.txt check, phone normalizing, in-memory test adapter, admin review-queue pattern. Not reusable: its filters and tables are contractor-specific, and it deliberately blocks Reddit, Nextdoor, Facebook and Yelp. A treated-as-allowed rule for an unreachable robots.txt applies to pages only, not to API or site terms.
9. **Price is flexible at the database, fixed in code.** `unlock_lead` takes the price as a parameter. The $10 and $5 values are in two code places (`stripe.ts`, `pricing.ts`), so price by source needs a change in the Stripe function, not the schema.
10. **Tests do not cover this.** The routing test uses a simplified `leads` table without source, consent, constraints or the public policy. A new gate would not be properly tested unless the harness is extended.
11. **Matching and locations.** Routing already works from ZIP and city data, so it is not limited to 5 cities. The 5-location limit applies to landing pages and the sitemap. City matching is free-text comparison ("Fort Worth" vs "Ft. Worth" will miss).

### A3. Business questions

Order matters. Pricing depends on the channel comparison, cost and quality definitions.

**Q1. Which channel gives better leads?** [OPEN]
- "Better" is not defined. Proposed measures: unlock rate, contractor-reported contact rate, win rate, refund rate, time to first contact.
- Reviewers expect Channel 2 leads to be better: the person asked for help and consented. External leads are colder, decay fast, and the person never asked to be contacted by a paid contractor. This is an expectation, not a measurement.
- No data exists for either channel. Channel 2 can be measured first because it already exists.

**Q2. Cost per lead per channel.** [OPEN]
- Channel 2: ad spend is not tracked today. SEO has build and content cost. Needs a spend record.
- Channel 1: cost depends on source. Licensed provider leads have a per-lead price that must be compared with the $10 unlock price (a lead sold to up to 3 contractors at $5 to $10 each yields at most $15 to $30 before refunds, and only if all three buy). Agent-found leads cost run time plus any model-classification spend, which scales with posts scanned, not leads found.
- Measure: cost per lead acquired, cost per paid unlock, revenue per lead, per source.

**Q3. How to measure lead quality.** [OPEN]
- A score with no outcome history is invented numbers. Start with pass/fail rules whose inputs are stored: phone or email present and valid, location resolved, service matched, age within window, source tier, duplicate status.
- Calibrate against outcomes (reached, wrong number, already hired, won, lost) after roughly 100 outcomes per source (reviewer estimate, not a tested figure).
- Outcomes are self-reported by contractors today and optional. Without them the loop does not close. Option: require an outcome before the next unlock or before a refund claim.

**Q4. Preventing duplicate sales.** [OPEN]
"Duplicate" covers three different things. Each needs its own rule.
- (a) The same person submitting twice. Today only an exact repeat submit is blocked.
- (b) The same person arriving from two channels or sources. Needs a normalized key (phone, email, then name + ZIP + service in a time window) and a link, not a delete. Dedupe must never delete or re-point a lead that already has assignments or payments. A contractor who unlocked the first copy must not be charged for the second.
- (c) One lead sold to several contractors. See Q4a.

**Q4a. Is a lead sold to several contractors a duplicate sale?** [OPEN, business decision]
- Today that is the design: up to 3 contractors each can pay. For a lead the customer asked for, that is a disclosed shared lead, and the pricing copy says "up to three".
- Reviewers split on external leads (see Reviewer Disagreements). One view: a person who posted publicly did not expect three paid calls, so start with 1 contractor per external lead or make the unlock exclusive (first payer wins). The other: keep current behavior and decide later.
- Exclusive unlock needs a concurrency guard that `unlock_lead` does not have.

**Q5. Preventing bad leads, refunds and disputes.** [OPEN]
- No refund path exists, and copy says unlocks are not refundable. Without one, Stripe chargebacks become the dispute process, with fees and account risk.
- Needed before charging for external leads: refund or credit reasons (wrong contact, duplicate, not seeking HVAC, outside area), a time window, a refund-state field on the assignment, a Stripe refund action in admin, refund and dispute webhook handling, and a visible contractor policy.
- Prevention: pass/fail checks before routing, a preview that shows lead age and source label, a human approval step in the first release.
- Alternative for a pilot: free unlocks (an admin free-unlock exists), so no refund is needed while quality is unknown.

**Q6. Pricing leads by source.** [OPEN, blocked on Q1 to Q3]
- Today: flat $10 Free / $5 Featured, in code.
- Direction: store price per source as data; start with 2 to 3 tiers; do not price on a score that is not calibrated.
- Minimum viable check: provider cost per lead is below expected net revenue per lead after refunds.

**Q7. Scaling across Texas.** [OPEN]
- Landing pages: 5 hard-coded locations. Moving locations into the database is only needed when more pages are wanted; reviewers say not in the first release.
- Supply: contractor count per city is unknown. A lead in a city with no contractor earns nothing. Demand counts by city (including aggregate figures from Channel 1) could decide where to recruit first.
- Matching ignores services offered and availability, so a mismatched contractor can receive a lead. Services field exists (paid plan only) but is not mapped to the lead's free-text issue.

### A4. Challenges requested by the owner

**Is Channel 1 worth building before Channel 2 and supply are proven?** The zoom-out, design and readiness reviewers all say no, not as an automated agent. Reasons: no contractor has used the portal, no payment has run, more leads do not fix a missing buyer, and Channel 1 adds cost and legal risk first. The reviewers' alternatives are in "Alternatives Weighed".

**Legal and platform-terms risk. A lawyer must confirm all of the following; none of this is a conclusion.**
- Each source's terms on collecting, storing, contacting and reselling.
- Federal rules on calls and texts (TCPA, Do Not Call) and on commercial email (CAN-SPAM), and Texas telemarketing and privacy rules, plus other state law if a person is outside Texas.
- Who is responsible if a contractor contacts someone who should not be contacted: HVACHelp, the contractor or the source.
- What wording makes a licensed provider's consent claim sufficient, and what contract terms are needed.
- Whether consent given elsewhere can carry to resale to a contractor.
- Data-removal requests, a do-not-contact list, consent evidence retention (timestamp, wording shown, URL, IP).
- Contractor terms of use on how an unlocked contact may be used.
- The privacy policy text currently describes the site request form, not external leads (README).

**Smallest first release.** See "Key Decisions & Staging".

### A5. Terms that need one-sentence definitions (comprehension reviewer)

- **Two agents share a name.** The existing agent finds contractors; the new one finds customers. They need different names, separate tables, a separate workflow and a separate kill switch. The existing agent must keep running unchanged.
- **"Lead"** today is a form request from a consenting person. Externally found people are not that. Suggested words: "request" (customer-submitted) and "prospect" (found externally, not yet sellable). [OPEN]
- **"Qualified," "permitted," "sellable," "eligible"** are used as if equal. Define each and who decides. [OPEN]
- **"Intended use"** is unclear: what the source's terms allow, or what the person expects. [OPEN]
- **"Aggregate insight"**: counts by city and service for admin and marketing only? Never sold? Minimum group size so no one is identifiable. [OPEN]
- **"Duplicate," "freshness," "outcome," "quality"** need definitions (see Q3, Q4). Freshness window may differ for emergency and routine requests.
- **Preview.** Today a contractor sees first and last name and the problem before paying. For an external lead the name is personal data from a source with unknown terms. Reviewers suggest a weaker preview (service, city, age, source label).
- **"Photos" and "premium features"** in the Featured plan do not exist today.
- **Free profile "limited info"** already shows phone and address. Which contact detail is the paid one is undefined. [OPEN]

### A6. Observability gaps

No routing log, no per-source counts, no reason stored for why a lead was or was not sold, no list of paid-but-not-unlocked, no count of sellable leads with zero assignments. These need to exist before a second lead stream is added.

---

## Goals vs. Non-Goals

**Goals [PROPOSED]**
- Add a lead-source and consent record that cannot be spoofed and is enforced inside the database.
- Make "not permitted means not sellable" a database rule, covering routing, admin manual tools, re-send, free unlock and Stripe unlock.
- Compare Channel 1 and Channel 2 on the same measures: cost per lead, unlock rate, refund rate, win rate.
- Measure Channel 2 first, because it already exists.
- Define a refund or credit policy and implement it before charging for external leads.
- Prevent duplicate sales across sources without deleting or re-pointing leads that are already assigned.
- Keep website lead behavior, price and routing unchanged for existing flows.
- Use non-permitted sources for aggregate demand figures only.

**Non-Goals (first release)**
- No automated crawling of community discussions or social platforms.
- No automatic promotion of external leads to sellable.
- No contacting found people on HVACHelp's behalf.
- No selling any person's details from a source whose terms or consent are unclear or unconfirmed by counsel.
- No learned or weighted quality score, no price-by-score, no fuzzy duplicate matching.
- No exclusive-lead product, unless decided in Q4a.
- No move of locations into the database, no expansion beyond cities that have contractor supply.
- No rebuild of routing, assignments, Stripe unlock, notifications or admin pages.
- No changes to the existing contractor discovery agent.

---

## Alternatives Weighed

| ID | Option | For | Against |
|---|---|---|---|
| A | Build both channels together, as decided | Matches the decision; fastest to a full system | Largest scope; payments, email and portal never run live; legal review not done; no supply proof |
| B | Channel 2 plus supply proof first; Channel 1 by hand later (zoom-out, design) | Uses what exists; gives a baseline; lowest legal risk | Slower to external leads; does not test Channel 1 early |
| C | Channel 1 as aggregate-only research, no personal data (a person browses permitted sources weekly and counts by city and service) | Cheap; no consent issue; tells where to recruit contractors | Does not produce sellable leads |
| D | Concierge: a person replies, where the platform allows, with a link to the request form. The person opts in via the form | Result is a Channel 2 lead with explicit consent | Depends on each platform allowing replies; manual; terms still to be checked |
| E | Licensed provider pilot: buy ~20 leads from one provider with documented consent, push through admin by hand, measure | Real unlock and refund data with little build | Provider cost against a $5 to $10 unlock price may not work; contract terms need counsel |
| F | Seed first contractors with free unlocks instead of buying or finding leads | No refund system needed yet; tests the buyer side | Produces no revenue data |
| G | Store external prospects in a separate intake table; promote to `leads` only when sellable (design, readiness) | Respects NOT NULL columns and the auto-route trigger; non-sellable rows hold no personal fields | Slightly more tables; a promotion step |
| H | Stretch the `leads` table with new columns and a `sellable` flag that `route_lead` checks (readiness, codebase) | Smaller change; reuses everything | Needs relaxed constraints or placeholders; every path must check the flag |

Reviewers lean toward B first, with C, D or E as Channel 1 tests, and G or H as the schema approach. The choice between G and H is not made.

---

## Reviewer Disagreements

- **Intake design.** The design reviewer says do not stretch `leads`; use an intake table and promote (G). The readiness and codebase reviewers accept either a staging table or a `sellable` column (G or H). No reviewer disputes that a database-level gate is required.
- **Contractors per external lead.** The design reviewer says start at 1 contractor or exclusive unlock. The readiness reviewer says keep shared (up to 3) for web leads and decide external separately. The zoom-out reviewer did not address it.
- **When to build the quality score and cross-source dedupe.** Zoom-out says defer both until real volume exists (simple pass/fail and a source-URL unique key). Readiness includes a rules-based score (admin only) and exact phone/email dedupe in the first release. Design says use a simple rules table now and calibrate later.
- **Starting source.** Zoom-out and design prefer a licensed provider or approved API with documented permission, or a manual import. The concept's wider list (public community discussions) is rated the weakest fit by zoom-out and design: intent unclear, freshness short, person did not ask to be contacted.
- **Refunds before the pilot.** Design: needed before charging, otherwise pilot on free unlocks. Zoom-out: not raised as a gate.
- **Scope of the first release.** Staging reviewer and zoom-out put Channel 2 first. Readiness describes a first release that already includes the Channel 1 staging table and review button. These are compatible only if Channel 1 staging is counted as Stage 2.

---

## Key Decisions & Staging for Next Steps

### Decisions

Tier 1 blocks planning.

| ID | Decision | Depends on | Who | Status |
|---|---|---|---|---|
| D1 | Is Channel 1 a revenue bet, or a way to seed contractors with leads? (goal changes how much consent risk is worth taking) | none | Owner | [OPEN] |
| D2 | Is Channel 1 in release 1, or after supply and Channel 2 are proven? Reviewers advise after | U1 to U4, U6, U7 | Owner | [OPEN] |
| D3 | Lawyer review is a gate before any external lead is sold or any found person is contacted. Name the lawyer and a date | none | Owner | [OPEN] |
| D4 | Definition of "lead" vs "prospect", "sellable", "duplicate", "quality", "outcome" (A5) | none | Owner | [OPEN] |

Tier 2 blocks scale.

| ID | Decision | Depends on |
|---|---|---|
| D5 | Source list: each source with access method, terms URL, date terms checked, rate limit, resale allowed (yes/no). Default for any new source is aggregate-only | D3 |
| D6 | Consent basis list (for example form consent, provider-warranted, public post without contact permission, unknown) and which are sellable. Default: anything unlisted is aggregate-only | D3 |
| D7 | Refund or credit policy: reasons, window, refund vs credit, contractor-visible text | D4 |
| D8 | Shared vs exclusive vs 1-contractor rule for external leads (Q4a) | D1, D7 |
| D9 | Dedupe keys and time window (phone, email, name + ZIP + service; 30 or 90 days) | D4 |
| D10 | Freshness window per lead type | D4 |
| D11 | Price by source or tier; maximum acceptable cost per external lead against $10/$5 | Q1 to Q3 data |
| D12 | Contractor preview contents for external leads | D6 |
| D13 | Who reviews each external lead before sale in the first release, and how many per week the owner can review | D2 |

Tier 3 deferred: locations as database data, texts to customers, price by score, fuzzy dedupe, learned scoring, wider sources.

### Open questions for the owner

- How many Texas contractors can be signed up in the first month, and in which city?
- What is the acceptable cost per external lead against a $5 to $10 unlock?
- Which specific sources count as "clearly permitting", and who confirms it?
- Who contacts an external person first, by which channel, and what are they told about where their details were found? (The concept leaves this open.)
- What happens when a person asks to stop or asks where their details came from, and who answers?
- Do external leads go to all contractors or to Featured only? This affects the reason to pay for Featured.
- Who is accountable if a contractor contacts someone they should not have?
- What is the volume target and budget per week, and what breaks even?
- Is the scope Texas only?
- What is "Featured" photos and "premium features" meant to include? Not in the current build.

### Staging (proposed for the owner to confirm; not decided)

**Stage 0. Verify the baseline.** Run the SQL (U1), load and check the ZIP table (U2), complete one Stripe test-mode unlock (U3), send one real alert email (U4), confirm contractor count (U6, U7). Read-only check of the live Supabase first; record the result. Run existing offline tests.
- Exit: one fake lead goes through to a paid unlock in test mode.

**Stage 1. Channel 2 with supply.** Sign up contractors in one metro (a reviewer suggested about 5 in one city, a placeholder gate to be set by the owner). Run Channel 2 only, with a small ad test and the existing SEO pages. In parallel, additive changes that help both channels:
- source and consent-basis fields on `leads` (nullable first, backfill existing rows as web form, then constrain; new numbered migration script, not an edit to the unverified one; server-written source, tighten the public insert policy);
- a `sellable` gate checked in `route_lead`, admin manual add, re-send, free unlock and `unlock.ts`, with a reason field; web leads default to sellable, so existing behavior is unchanged;
- a routing log and an admin list of sellable leads with no assignments;
- refund state and an outcome code on `lead_assignments`;
- customer confirmation email (reuse Resend queue);
- extend the routing test harness to the real `leads` definition.
- Also in parallel, without building the agent: manual aggregate-only counts (Alternative C), the lawyer review (D3), and contractor conversations about what they would pay for.
- Exit: unlocks occurring on real Channel 2 leads, with cost per lead, unlock rate and refund rate measured.

**Stage 2. Channel 1 pilot, only if D2, D3 and Stage 1 exit are met.** One or two sources with clearly documented permission (a licensed provider feed or an approved API, or a manual import). External prospects go to a staging table. A person approves each one in admin before it becomes sellable. Cap at 1 contractor per lead unless D8 says otherwise. Preview is weaker than for web leads and labelled by source. Exact phone/email dedupe with links, no deletes. A rules-based quality result stored with its inputs, shown to admin only.
- Exit: compare unlock, refund and win rates with Channel 2. Review 20 or more staged candidates by hand against their source URLs before any automation. A source that does not cover its cost is stopped.

**Stage 3. Automation and scale, only if Stage 2 shows repeat purchases.** Automate the one source in a new agent (own tables, own workflow, own kill switch, daily caps on posts scanned and spend, keyword prefilter before any model call, store only the matched excerpt, hash and URL, delete raw text after N days). Then price by source, a calibrated quality score, locations as data, more cities where contractors exist.

### Acceptance checks for the first schema release (from readiness review)

1. A web-form lead behaves as today: same fields, routing and price.
2. A prospect without an approved consent basis gets no assignment, does not appear in `my_leads()`, triggers no email, and counts only in admin aggregates.
3. A promoted prospect stores source, URL, captured date, location, service, intent, freshness date and consent basis; a missing required field blocks promotion and the reason is recorded.
4. Two records with the same normalized phone in the window produce one sellable lead and one linked duplicate; a contractor who unlocked the first is not charged for the second.
5. The same inputs give the same quality result, and the inputs are visible to admin.
6. A paid unlock of an external lead charges the configured price in Stripe test mode and reveals contact details only after the webhook or confirm step.
7. A refund or credit changes assignment state and shows in admin.
8. Turning the agent flag off stops new prospects and leaves existing leads working.
9. The old application version still saves a web-form lead against the new schema (deploy database first, then frontend; no column removed or renamed in the same release).

### Risks to carry

- Legal and platform-terms exposure (all items need counsel).
- Low-quality or stale external leads, causing contractor churn with no refund path.
- Silent routing failure with no alarm.
- Layering a new channel on a payment and email chain that has never run live.
- Lead supply in cities with no contractors.
- Admin workload: someone must review external leads and, today, every contractor claim.
- Cost of any model-based intent classification scales with posts scanned.
