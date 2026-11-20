# Lead Management, Project Management and Government Bid Preparation: final report

## Completed functionality
- **Menu and dashboard:** Opportunities dropdown (Discover Opportunities, My Leads), My Projects, Bid Preparation, My Messages, Analytics. Dashboard "Latest Opportunities" shows locked items only, with an unlock column. Name and concern are on separate lines everywhere.
- **Discover Opportunities:** locked leads, permits and government contracts with filters (city, saved, industry, trade, value, found date) and sorting.
- **My Leads:** unlocked leads only, seven status tabs, contact / opportunity / transaction details, Call and Email (logged), follow-up dates, notes, activity timeline, status changes.
- **Lead to project:** an Accepted, unlocked lead converts once into a project, with the contract value recorded as an accepted quotation. The lead stays in My Leads as Converted.
- **My Projects:** list with seven status tabs and a progress bar; project page with Overview, Client Information, Scope of Work, Tasks and Schedule (with team), Documents, Quotations and Contracts, Expenses, Activity Timeline.
- **Bid Preparation:** workspaces for unlocked government bids or your own solicitations; document upload or paste; AI analysis into a compliance checklist; cost estimate; versioned proposals; approval workflow; amendment detection; deadline reminders and automatic expiry; award converts to a project.
- **AI proposal agent:** analyses solicitations, drafts proposals and reviews them. It cannot approve or submit.

## Database changes (run in the Supabase SQL Editor, in this order)
`schema-revamp.sql` / `schema-flow.sql` (if not yet run), `schema-myleads.sql`, `schema-projects.sql`, `schema-bidprep.sql`. All are safe to re-run.
- **My Leads:** pipeline stages and `follow_up_on` on `lead_pipeline`; `lead_activities`; triggers that keep stage and legacy status in step; RPCs `add_lead_activity`, `my_lead_activities`, `my_unlock_receipts`.
- **Projects:** `projects`, `quotations`, `lead_conversions`, `project_tasks`, `project_documents`, `project_team`, `project_expenses`, `project_activities`; RPC `convert_lead_to_project`.
- **Bids:** `bid_workspaces`, `bid_documents`, `bid_requirements`, `bid_estimate_lines`, `bid_proposals`, `bid_activities`; RPCs `start_bid_workspace`, `new_bid_proposal`, `set_bid_proposal_status`, `bid_blockers`, `refresh_bid_source`, `my_bid_source_changes`, `refresh_bid_deadlines`, `convert_bid_to_project`.

## New and modified components
- **Contractor pages:** `ContractorLayout`, `ContractorHome`, `ContractorLeadHub` (Discover), `ContractorMyLeads`, `ContractorProjects`, `ContractorProjectDetail`, `ContractorBidPreparation`, `ContractorBidDetail`, `ContractorAnalytics`.
- **Hooks and libraries:** `useLeadHub`, `useProjects`, `lib/projects.ts`, `lib/bidprep.ts`, `lib/extract-text.ts`.
- **Admin:** `LeadsList` (name and concern separated).
- **Removed:** `LeadsTabs`.

## API endpoints
- `POST /api/bids/ai` with task `analyze`, `draft` or `review`. Signed-in, Featured or Premium plan, shares the Assistant's daily limit.
- Everything else uses Supabase row security and RPCs directly from the browser.

## Security changes
- **Locked contact details:** never sent to the browser or the AI until the lead is paid for.
- **Payments:** only the server can unlock, and a repeated payment event never changes or doubles the charge record.
- **Conversion:** requires Accepted and unlocked. Contact data is copied server-side, and a row lock plus unique links give exactly one project per lead or bid.
- **Locked-down fields:** project owner, lead link and bid link cannot be edited. Activity timelines cannot be forged. A converted project cannot be deleted.
- **Bid approval:**
  - A bid cannot be Approved or Submitted without a proposal a person approved and every mandatory requirement verified.
  - Editing an approved proposal withdraws the approval.
  - Only a Submitted bid can be Awarded.
- **AI limits:** the AI marks a requirement Verified only when it quotes evidence found in your own profile, and it never touches approval.
- **Privacy:** every table is private to the owning business.

## Test results
- **Type check, lint and build:** pass.
- **Offline script tests:** 18 pass.
- **Database tests:** 13 pass against the real schema files in an in-memory Postgres. The new one is `scenarios.test.mjs`.
- **Scenario 1, new lead:** it is locked and masked, a paid unlock is recorded once, and it then shows with contact details in My Leads. Another business stays locked.
- **Scenario 2, conversion:** the lead is worked to Accepted and converts to a project. Only its owner can convert it.
- **Scenario 3, government bid:** an unlocked bid becomes a workspace. The AI draft stays a draft, a mandatory gap blocks approval, a person approves, and the bid is submitted, awarded and converted.
- **Scenario 4, duplicates:** repeated and simultaneous conversions, repeated payments and repeated workspace starts create nothing new.
- **Not tested:** the pages were not exercised in a signed-in browser, and the AI was tested with a mock, not a live model.

## Remaining tasks
- **Premium:** automatic unlock by preferences is not built. Premium sees only saved leads in My Leads.
- **Categories:** Construction and Commercial Projects are not separate categories.
- **Files:** project and bid documents are links or pasted text, with no file storage. Word files and scanned PDFs must be pasted.
- **Email:** the Email button opens your mail app, and there is no in-app composer or reminder email. Reminders are in-app only.
- **Bid values:** government bids carry no contract value until you enter it at conversion.
- **Amendments:** uploaded solicitations are not watched for amendments.
- **Check:** use the pages signed in as Free, Featured and Premium.
