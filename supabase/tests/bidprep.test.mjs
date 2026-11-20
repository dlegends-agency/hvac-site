// Loads the real schema files in order into in-memory Postgres (PGlite) with stubs for Supabase auth, then checks Bid Preparation: a workspace
// can only start from an unlocked bid, a bid cannot be approved or submitted while a mandatory requirement is unverified (however the AI
// scored it), only a person can approve a proposal, only a submitted bid can be awarded, an awarded bid becomes one project, and everything
// is private to the business.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/bidprep.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create schema net; create table net.calls (url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls values (url, headers, body) returning 1::bigint $$;
`);
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-revamp.sql", "schema-myleads.sql", "schema-projects.sql", "schema-bidprep.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-bidprep.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated; grant select on public.listing_owners, public.listings, public.project_documents, public.project_activities to authenticated; grant select, insert, update, delete on public.lead_pipeline to authenticated; grant execute on all functions in schema public to authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const uid = async (email) => (await q("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))[0].id;
const mkListing = async (name) => {
  const id = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code) values ($1,'published',$2,'Austin','Texas','78701') returning id", [name.toLowerCase().replace(/\W+/g, "-"), name]))[0].id;
  const user = await uid(`${name}@x.com`);
  await q("insert into public.listing_owners (listing_id,user_id) values ($1,$2)", [id, user]);
  return { id, user };
};
const A = await mkListing("Acme HVAC");
const B = await mkListing("Bravo Air");
const bid = (await q("insert into public.gov_bids (notice_id, title, solicitation_number, agency, notice_type, city, state, response_due, description, summary, contacts) values ('n1','Replace chillers, Fort Hood','W9126-26-R-0001','US Army','Solicitation','Fort Hood','TX', now() + interval '20 days','Replace two chillers. Bonding required.','Chillers','[{\"name\":\"Officer Lee\",\"email\":\"lee@army.mil\",\"phone\":\"2545550100\"}]') returning id"))[0].id;
const run = (user, sql, p) => as(user, () => db.query(sql, p));
const one = async (user, sql, p) => (await run(user, sql, p)).rows[0];

// ---------------------------------------------------------------- a workspace starts only from an unlocked bid
await assert.rejects(() => run(A.user, "select public.start_bid_workspace($1)", [bid]), /Unlock this bid first/, "a locked bid has no workspace");
await q("insert into public.opportunity_unlocks (listing_id, kind, item_id, unlock_cents, unlock_ref) values ($1,'bid',$2,1500,'cs_b')", [A.id, bid]);
const ws = (await one(A.user, "select public.start_bid_workspace($1) as id", [bid])).id;
assert.equal((await one(A.user, "select public.start_bid_workspace($1) as id", [bid])).id, ws, "starting twice gives the same workspace");
const w = (await q("select * from public.bid_workspaces where id=$1", [ws]))[0];
assert.deepEqual([w.status, w.title, w.agency, w.location], ["under_review", "Replace chillers, Fort Hood", "US Army", "Fort Hood, TX"]);
assert.equal((await q("select count(*)::int n from public.bid_documents where workspace_id=$1 and extracted_text like 'Replace two chillers%'", [ws]))[0].n, 1, "the notice text is the first document");
await assert.rejects(() => run(A.user, "insert into public.bid_workspaces (listing_id, gov_bid_id, title) values ($1,$2,'x')", [A.id, bid]), /row-level security/, "a notice link cannot be made by hand");
assert.equal((await run(B.user, "select * from public.bid_workspaces")).rows.length, 0, "another business sees nothing");
await assert.rejects(() => run(B.user, "select public.refresh_bid_source($1)", [ws]), /Bid not found/);
await assert.rejects(() => run(B.user, "insert into public.bid_requirements (workspace_id, text) values ($1,'x')", [ws]), /row-level security/);

// ---------------------------------------------------------------- a checklist, and the blocks it puts on approval
await run(A.user, "insert into public.bid_requirements (workspace_id, category, text, mandatory, status, source) values ($1,'bonding','Bid bond of 20%',true,'manual','ai'), ($1,'license','Texas mechanical license',true,'verified','ai'), ($1,'attachment','Past performance form',false,'missing','ai')", [ws]);
assert.equal((await one(A.user, "select public.bid_blockers($1) as n", [ws])).n, 1, "only mandatory, unverified requirements block");
const p1 = (await one(A.user, "select public.new_bid_proposal($1,'Chiller proposal','[{\"title\":\"Cover letter\",\"body\":\"Dear Officer\"}]'::jsonb, true) as id", [ws])).id;
const prop = (await q("select * from public.bid_proposals where id=$1", [p1]))[0];
assert.deepEqual([prop.version, prop.status, prop.by_ai, prop.approved_at], [1, "draft", true, null], "an AI draft is only ever a draft");
assert.equal((await q("select status from public.bid_workspaces where id=$1", [ws]))[0].status, "preparing_bid");
await assert.rejects(() => run(A.user, "select public.set_bid_proposal_status($1,'approved')", [p1]), /mandatory requirement must be verified/, "a missing mandatory requirement blocks approval");
await assert.rejects(() => run(A.user, "update public.bid_workspaces set status='approved' where id=$1", [ws]), /Approve a proposal first/, "the status cannot be set around it");
await assert.rejects(() => run(A.user, "update public.bid_workspaces set status='submitted' where id=$1", [ws]), /Approve a proposal first/);
await assert.rejects(() => run(A.user, "update public.bid_proposals set status='approved', approved_at=now() where id=$1", [p1]), /permission denied/, "a proposal cannot be approved by editing the row");
await assert.rejects(() => run(A.user, "insert into public.bid_proposals (workspace_id, version, status) values ($1, 9, 'approved')", [ws]), /permission denied/);

// verify the last requirement, then a person approves
await run(A.user, "update public.bid_requirements set status='verified', evidence='Bond letter from surety' where workspace_id=$1 and category='bonding'", [ws]);
const emptyP = (await one(A.user, "select public.new_bid_proposal($1,'Empty','[{\"title\":\"x\",\"body\":\"  \"}]'::jsonb,false) as id", [ws])).id;
await assert.rejects(() => run(A.user, "select public.set_bid_proposal_status($1,'approved')", [emptyP]), /empty/, "an empty proposal cannot be approved");
await run(A.user, "select public.set_bid_proposal_status($1,'internal_review')", [p1]);
assert.equal((await q("select status from public.bid_workspaces where id=$1", [ws]))[0].status, "internal_review");
await run(A.user, "select public.set_bid_proposal_status($1,'approved')", [p1]);
const approved = (await q("select status, approved_at, approved_by from public.bid_proposals where id=$1", [p1]))[0];
assert.ok(approved.status === "approved" && approved.approved_at && approved.approved_by === A.user, "approval records who and when");
assert.equal((await q("select status from public.bid_workspaces where id=$1", [ws]))[0].status, "approved");
await assert.rejects(() => run(B.user, "select public.set_bid_proposal_status($1,'draft')", [p1]), /Proposal not found/, "another business cannot touch it");

// editing the approved words, or un-verifying a requirement, withdraws the approval
await run(A.user, "update public.bid_proposals set sections='[{\"title\":\"Cover letter\",\"body\":\"Changed\"}]'::jsonb where id=$1", [p1]);
assert.deepEqual([(await q("select status from public.bid_proposals where id=$1", [p1]))[0].status, (await q("select status from public.bid_workspaces where id=$1", [ws]))[0].status], ["draft", "preparing_bid"], "editing withdraws approval");
await run(A.user, "select public.set_bid_proposal_status($1,'approved')", [p1]);
await run(A.user, "update public.bid_requirements set status='needs_update' where workspace_id=$1 and category='license'", [ws]);
assert.deepEqual([(await q("select status from public.bid_proposals where id=$1", [p1]))[0].status, (await q("select status from public.bid_workspaces where id=$1", [ws]))[0].status], ["internal_review", "internal_review"], "a requirement going bad withdraws approval");
await run(A.user, "update public.bid_requirements set status='verified' where workspace_id=$1 and category='license'", [ws]);
await run(A.user, "select public.set_bid_proposal_status($1,'approved')", [p1]);

// ---------------------------------------------------------------- submit, award, convert once
await assert.rejects(() => run(A.user, "update public.bid_workspaces set status='awarded' where id=$1", [ws]), /Only a submitted bid can be awarded/);
await run(A.user, "update public.bid_workspaces set status='submitted' where id=$1", [ws]);
await assert.rejects(() => run(A.user, "select public.convert_bid_to_project($1, 100000)", [ws]), /Only an awarded bid/, "not awarded yet");
await run(A.user, "update public.bid_workspaces set status='awarded' where id=$1", [ws]);
await run(A.user, "insert into public.bid_documents (workspace_id, name, doc_type, url) values ($1,'Drawings','Drawing','https://example.com/d.pdf')", [ws]);
await assert.rejects(() => run(A.user, "select public.convert_bid_to_project($1)", [ws]), /awarded contract value/);
const pr = (await one(A.user, "select public.convert_bid_to_project($1, 250000) as id", [ws])).id;
const project = (await q("select * from public.projects where id=$1", [pr]))[0];
assert.deepEqual([project.status, Number(project.contract_value), project.client_company, project.client_name, project.client_phone, project.client_email, project.industry], ["awarded", 250000, "US Army", "Officer Lee", "2545550100", "lee@army.mil", "Government contract"], "details copied by the server");
assert.equal(project.bid_workspace_id, ws);
assert.equal((await q("select count(*)::int n from public.project_documents where project_id=$1", [pr]))[0].n, 1, "linked documents come across");
assert.equal((await one(A.user, "select public.convert_bid_to_project($1, 1) as id", [ws])).id, pr, "converting again returns the same project");
const both = await Promise.all([1, 2].map(() => one(A.user, "select public.convert_bid_to_project($1, 5) as id", [ws])));
assert.deepEqual(both.map((r) => r.id), [pr, pr]);
assert.equal((await q("select count(*)::int n from public.projects"))[0].n, 1, "one project");
assert.equal((await q("select count(*)::int n from public.lead_conversions where kind='bid'"))[0].n, 1, "the lead side knows too, so My Leads cannot convert it again");
await assert.rejects(() => run(A.user, "update public.bid_workspaces set status='lost' where id=$1", [ws]), /awarded bid cannot change/);

// ---------------------------------------------------------------- manual workspace, deadline, amendments
const m = (await one(A.user, "insert into public.bid_workspaces (listing_id, title, due_at) values ($1,'City Hall RTU swap', now() - interval '1 day') returning id", [A.id])).id;
assert.equal((await one(A.user, "select public.refresh_bid_deadlines() as n")).n, 1, "a passed deadline marks the bid expired");
assert.equal((await q("select status from public.bid_workspaces where id=$1", [m]))[0].status, "expired");
assert.equal((await q("select status from public.bid_workspaces where id=$1", [ws]))[0].status, "awarded", "a submitted or awarded bid is never expired");
await assert.rejects(() => run(A.user, "update public.bid_workspaces set gov_bid_id=$2 where id=$1", [m, bid]), /permission denied/, "the notice link cannot be edited");

const bid2 = (await q("insert into public.gov_bids (notice_id, title, notice_type, response_due, description, summary) values ('n2','Boiler work','Solicitation', now() + interval '9 days','Original text','s') returning id"))[0].id;
await q("insert into public.opportunity_unlocks (listing_id, kind, item_id) values ($1,'bid',$2)", [A.id, bid2]);
const ws2 = (await one(A.user, "select public.start_bid_workspace($1) as id", [bid2])).id;
assert.equal((await run(A.user, "select * from public.my_bid_source_changes()")).rows.length, 0, "nothing changed yet");
await q("update public.gov_bids set description='Amended text: add a site visit', response_due = now() + interval '30 days' where id=$1", [bid2]);
assert.deepEqual((await run(A.user, "select * from public.my_bid_source_changes()")).rows.map((r) => r.workspace_id), [ws2], "an amended notice is flagged");
await run(A.user, "select public.refresh_bid_source($1)", [ws2]);
assert.equal((await run(A.user, "select * from public.my_bid_source_changes()")).rows.length, 0);
assert.ok((await q("select 1 from public.bid_documents where workspace_id=$1 and extracted_text like 'Amended%'", [ws2])).length === 1, "the new text replaces the old");
assert.ok((await q("select 1 from public.bid_activities where workspace_id=$1 and type='amendment'", [ws2])).length === 1, "the amendment is on the timeline");

// ---------------------------------------------------------------- the timeline cannot be forged, and notes can be added
await assert.rejects(() => run(A.user, "insert into public.bid_activities (workspace_id, type, body) values ($1,'status','forged')", [ws2]), /row-level security/);
await run(A.user, "insert into public.bid_activities (workspace_id, type, body) values ($1,'note','Site visit Tuesday')", [ws2]);
assert.equal((await run(B.user, "select * from public.bid_activities")).rows.length, 0);

console.log("bid preparation tests passed");
