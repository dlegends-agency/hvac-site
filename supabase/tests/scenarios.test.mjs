// Part 5 scenarios, end to end against the real schema files in PGlite: (1) a new lead is locked until paid, (2) an accepted lead becomes a project,
// (3) a government bid goes from unlocked notice to awarded project with a person's approval, (4) nothing is charged or created twice.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/scenarios.test.mjs
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
await db.exec("grant usage on schema auth, public to authenticated; grant select on public.listing_owners, public.listings, public.project_documents, public.project_activities to authenticated; grant select, insert, update, delete on public.lead_pipeline to authenticated; grant execute on all functions in schema public to authenticated; revoke execute on function public.unlock_lead(uuid, uuid, int, text) from authenticated");

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
const run = (user, sql, p) => as(user, () => db.query(sql, p));
const one = async (user, sql, p) => (await run(user, sql, p)).rows[0];
const count = async (sql, p) => (await q(sql, p))[0].n;

// ================= Scenario 1: a new lead arrives, is locked, is paid for once and then shows in My Leads
const lead = (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source, description) values ('AC Not Cooling','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100','jane@x.com','Phone','Residential','Homeowner',true,'new','homepage','Upstairs unit warm') returning id"))[0].id;
await q("insert into public.lead_assignments (lead_id, listing_id, source) values ($1,$2,'auto') on conflict do nothing", [lead, A.id]);
await q("insert into public.lead_assignments (lead_id, listing_id, source) values ($1,$2,'auto') on conflict do nothing", [lead, B.id]);
let mine = (await run(A.user, "select * from public.my_leads()")).rows[0];
assert.equal(mine.unlocked, false, "a new lead starts locked");
assert.deepEqual([mine.phone, mine.email, mine.street], [null, null, null], "locked contact details are never sent to the contractor");
await assert.rejects(() => run(A.user, "select public.update_my_lead($1,'contacted','x')", [lead]), /Unlock this lead first/, "a locked lead cannot be worked");
await assert.rejects(() => run(A.user, "select public.unlock_lead($1,$2,500,'free')", [lead, A.id]), /permission denied/, "a contractor cannot unlock without paying");
await q("select public.unlock_lead($1,$2,500,'cs_1')", [lead, A.id]);
await q("select public.unlock_lead($1,$2,500,'cs_2')", [lead, A.id]); // a repeated or replayed payment event
const a = (await q("select unlock_cents, unlock_ref from public.lead_assignments where lead_id=$1 and listing_id=$2", [lead, A.id]))[0];
assert.deepEqual([a.unlock_cents, a.unlock_ref], [500, "cs_1"], "a second payment event never changes or doubles the charge record");
mine = (await run(A.user, "select * from public.my_leads()")).rows[0];
assert.deepEqual([mine.unlocked, mine.phone, mine.email], [true, "5125550100", "jane@x.com"], "paid: contact details appear");
assert.equal((await run(B.user, "select * from public.my_leads()")).rows[0].phone, null, "another business that has not paid still sees nothing");

// ================= Scenario 2: work the lead, accept it, convert it to a project
await run(A.user, "insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,'lead',$2,'AC Not Cooling')", [A.id, lead]);
for (const stage of ["contacted", "follow_up", "interested", "quoted", "won"]) await run(A.user, "update public.lead_pipeline set stage=$2 where item_id=$1", [lead, stage]);
assert.equal((await q("select contractor_status s from public.lead_assignments where lead_id=$1 and listing_id=$2", [lead, A.id]))[0].s, "won", "the pipeline stage and the lead status agree");
await assert.rejects(() => run(B.user, "select public.convert_lead_to_project('lead',$1,'Residential HVAC','AC repair',4200,'x')", [lead]), /Lead not found/, "only the business that owns the lead converts it");
const proj = (await one(A.user, "select public.convert_lead_to_project('lead',$1,'Residential HVAC','AC repair',4200,'Accepted by phone') as id", [lead])).id;
assert.equal((await q("select client_name from public.projects where id=$1", [proj]))[0].client_name, "Jane Doe");
assert.equal((await q("select stage from public.lead_pipeline where item_id=$1", [lead]))[0].stage, "converted", "the lead stays in My Leads as Converted");

// ================= Scenario 4: converting again, or at the same moment, creates nothing new
const again = await Promise.all([1, 2, 3].map(() => one(A.user, "select public.convert_lead_to_project('lead',$1,'Residential HVAC','AC repair',9999,'again') as id", [lead])));
assert.deepEqual(again.map((r) => r.id), [proj, proj, proj]);
assert.equal(await count("select count(*)::int n from public.projects"), 1, "one project for one lead");
assert.equal(await count("select count(*)::int n from public.quotations"), 1);

// ================= Scenario 3: a government bid, AI draft, human approval, award, project
const bid = (await q("insert into public.gov_bids (notice_id, title, agency, notice_type, city, state, response_due, description, summary, contacts) values ('n1','Replace chillers','US Army','Solicitation','Fort Hood','TX', now() + interval '20 days','Replace two chillers.','Chillers','[{\"name\":\"Officer Lee\",\"email\":\"lee@army.mil\"}]') returning id"))[0].id;
await assert.rejects(() => run(A.user, "select public.start_bid_workspace($1)", [bid]), /Unlock this bid first/, "no workspace before the bid is unlocked");
await q("insert into public.opportunity_unlocks (listing_id, kind, item_id, unlock_cents, unlock_ref) values ($1,'bid',$2,1500,'cs_b')", [A.id, bid]);
const ws = (await one(A.user, "select public.start_bid_workspace($1) as id", [bid])).id;
await run(A.user, "insert into public.bid_requirements (workspace_id, category, text, mandatory, status, source) values ($1,'license','Texas mechanical license',true,'manual','ai')", [ws]);
const draft = (await one(A.user, "select public.new_bid_proposal($1,'Proposal','[{\"title\":\"Cover\",\"body\":\"Dear Officer\"}]'::jsonb,true) as id", [ws])).id;
assert.equal((await q("select status from public.bid_proposals where id=$1", [draft]))[0].status, "draft", "the AI agent only ever produces a draft");
await assert.rejects(() => run(A.user, "select public.set_bid_proposal_status($1,'approved')", [draft]), /mandatory requirement must be verified/, "nothing is approved while a mandatory requirement is unverified");
await assert.rejects(() => run(A.user, "update public.bid_workspaces set status='submitted' where id=$1", [ws]), /Approve a proposal first/, "nothing is submitted without a person's approval");
await run(A.user, "update public.bid_requirements set status='verified', evidence='License no. on file' where workspace_id=$1", [ws]);
await run(A.user, "select public.set_bid_proposal_status($1,'approved')", [draft]);
await run(A.user, "update public.bid_workspaces set status='submitted' where id=$1", [ws]);
await run(A.user, "update public.bid_workspaces set status='awarded' where id=$1", [ws]);
const bp = (await one(A.user, "select public.convert_bid_to_project($1, 250000) as id", [ws])).id;
assert.notEqual(bp, proj);
assert.equal((await one(A.user, "select public.convert_bid_to_project($1, 1) as id", [ws])).id, bp, "the awarded bid converts once");
assert.equal(await count("select count(*)::int n from public.projects"), 2, "one project per lead and one per bid, no duplicates");
assert.equal(await count("select count(*)::int n from public.opportunity_unlocks"), 1, "the bid is paid for once");
assert.equal((await run(B.user, "select * from public.projects")).rows.length, 0, "another business sees none of it");

console.log("scenario tests passed");
