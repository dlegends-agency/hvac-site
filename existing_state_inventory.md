# HVACHelp: what exists today

Checked against the repository on 2026-11-03 (latest commit `c9eab59`). "Built" means the code and database rules exist and were tested
in isolation. It does not mean it has been used in production: see "Not verified" at the end.

Stack: React 19, Vite, TypeScript, Tailwind. Supabase (Postgres, Auth, Row Level Security). Cloudflare Pages with Pages Functions for server code.
GitHub Actions for scheduled jobs. Stripe for payments. Resend for email.

## 1. Customer website

| Requirement | State | What is there |
|---|---|---|
| Lead generation homepage | Built | Hero, how it works, services, FAQ, directory promo, five-step request form. |
| Request form | Built | Multi-select HVAC issues, urgency, address, contact details, property details, consent. Validated with Zod. Duplicate-submit protection. Saved to `leads` through an insert-only public policy. |
| Texas and city landing pages | Partly built | Texas plus 4 cities only (Austin, Dallas, Houston, San Antonio). The list is a code file (`src/config/locations.ts`), not data in the database. |
| Emergency and service pages | Built | 15 service pages (emergency AC, furnace, heat pump, commercial, and others) with FAQs and structured data. |
| SEO | Built | 26 pages prerendered at build time, sitemap function, JSON-LD, canonical tags, and an admin SEO audit tool. |
| Contractor matching for the customer | Built (automatic) | The customer does not choose. Each lead is routed to up to 3 contractors by city or by ZIP distance. |
| Not built | | Customer accounts or lead status for the customer, confirmation email or text to the customer, phone or email verification of leads, spam scoring beyond a hidden honeypot field. |

## 2. Contractor portal

| Requirement | State | What is there |
|---|---|---|
| Registration and onboarding | Built | Email and password sign-up. The contractor claims an existing listing or adds a business. An admin approves each claim. |
| Business profile | Built | Free plan: name, phone, address. Paid plan adds About us, services, service areas, website, email, Google stars. Live preview of the directory card. |
| Verification | Minimal | Manual admin approval of the claim only. No Texas licence (TDLR) check, no insurance or document upload. |
| Service area and ZIP coverage | Partly built | One ZIP code, a travel radius of 5 to 150 miles, and a free-text list of other cities. No list of ZIP codes and no map or polygon. |
| Services offered | Built | A fixed list of services, paid plan only. Not used for matching yet. |
| Availability | Not built | No hours, capacity, vacation pause, or per-day lead limit. |
| Receive and manage leads | Built | Contractor sees name and problem. Pays to unlock the rest. Status (new, contacted, won, lost) and private notes. |
| Subscription and per-lead plans | Built, not live-tested | Free plan, Featured plan ($10 a month or $99 a year), and per-lead unlock ($10 on Free, $5 on Featured) through Stripe Checkout. |
| Billing and payment history | Built | Card on file, "Update card", invoices and receipts read from Stripe. |
| Account settings | Built | Change email and password, email alerts on or off. |
| Performance reports | Not built | The dashboard shows counts of new, locked, contacted and won leads. No response time, win rate, spend, or trend. |

## 3. Admin portal

| Requirement | State | What is there |
|---|---|---|
| Manage customers | Not built | There is no customer record. Only leads exist. |
| Review and approve contractors | Built | Claims queue. Approve or reject. Listing editor for every field and the plan. |
| Manage leads | Built | List, detail, status, internal notes. See which contractors received a lead and whether they paid. Add or remove contractors. Re-send to matching contractors. Unlock free. |
| Lead assignment and distribution | Built | Automatic in the database, plus manual override. |
| Subscriptions and payments | Partly built | "Businesses that paid" table, estimated monthly plan revenue, 30-day unlock revenue. No refunds, no failed-payment list, no Stripe-level reconciliation. |
| Contractor performance | Partly built | Per-lead status per contractor is visible. No contractor-level summary. |
| Manage service locations | Not built in the admin | Locations are in code. The only database location data is the ZIP code table (about 33,800 US ZIP codes). |
| Analytics | Built | Page views, visitors, leads, conversion, top cities, traffic sources, listing registrations. |
| Platform configuration | Not built | Prices, the 3-contractor cap, and the radius limits live in code or SQL. |
| Also built | | Contractor directory and an automated discovery agent that finds contractors from OpenStreetMap and their own websites, blog, contact form and messages inbox. |

## 4. Core backend

| Requirement | State |
|---|---|
| Authentication | Supabase email and password. |
| Roles | Two roles in practice: admin (`admin_users` table) and contractor (row in `listing_owners`). No role table and no staff roles below admin. |
| Row Level Security | On every table. Contractors read leads only through two database functions that hide contact details until unlocked. |
| Automated lead matching | Built in SQL (`route_lead`): published listing, approved owner, city or ZIP-radius match, up to 3 contractors, paid first, then local, then rotation, then nearest. Matching does not use services offered or availability. |
| Lead distribution and tracking | Built: `lead_assignments` holds per-contractor status, notes, contact time, unlock payment. |
| Email notifications | Built to Resend through a database queue, a ping, and a 10-minute backup job. Contractor alerts only. No customer emails. |
| Payments | Stripe subscriptions, per-lead Checkout, webhook, billing portal. |
| Tests | Offline tests for routing SQL (in-memory Postgres), Stripe, unlock, email, Google. No browser end-to-end tests. |

## Not verified

- The latest database script (`supabase/schema-contractors.sql`) has not been confirmed as run on your Supabase project.
- The ZIP code table has not been confirmed as loaded, so distance matching may be off.
- Stripe has not been used with real or test payments. Prices, the webhook, and the customer portal are not confirmed as set up.
- Email alerts need Resend, three Cloudflare settings and one database setting. Not confirmed as set up.
- Google star ratings need a Google Cloud key with a quota. Not confirmed as set up.
- No real contractor has used the contractor portal. The number of contractors and the traffic are unknown to me.
