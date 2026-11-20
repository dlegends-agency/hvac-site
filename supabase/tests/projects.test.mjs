// Loads the real schema files in order into in-memory Postgres (PGlite) with stubs for Supabase auth, then checks converting an accepted lead
// into a project: only accepted and unlocked leads convert, the project is created once, contact details are copied by the server, the
// lead stays in My Leads as Converted with its history, and projects are private to the business.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/projects.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-revamp.sql", "schema-myleads.sql", "schema-projects.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-projects.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated; grant select, insert, update, delete on public.lead_pipeline to authenticated; grant select on public.listing_owners, public.listings, public.lead_activities to authenticated; grant execute on all functions in schema public to authenticated");

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
const lead = async () =>
  (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source, description) values ('AC Not Cooling','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100','jane@x.com','Phone','Residential','Homeowner',true,'new','homepage','Upstairs unit warm') returning id"))[0].id;
const save = (user, listing, item, kind = "lead") => as(user, () => db.query("insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,$2,$3,'x')", [listing, kind, item]));
const setStage = (user, listing, item, stage, kind = "lead") => as(user, () => db.query("update public.lead_pipeline set stage=$4 where listing_id=$1 and kind=$2 and item_id=$3", [listing, kind, item, stage]));
const convert = (user, kind, item, value = null) => as(user, () => db.query("select public.convert_lead_to_project($1,$2,'Residential HVAC','AC repair',$3,'Verbal yes') as id", [kind, item, value])).then((r) => r.rows[0].id);

// ---------------------------------------------------------------- not accepted, not unlocked: refused
const l1 = await lead();
await save(A.user, A.id, l1);
await assert.rejects(() => convert(A.user, "lead", l1, 4200), /accepted offer/, "a lead that is not Accepted cannot convert");
await setStage(A.user, A.id, l1, "won");
await assert.rejects(() => convert(A.user, "lead", l1, 4200), /Unlock this lead first/, "a locked lead cannot convert, so no contact details leak");
assert.equal((await q("select count(*)::int n from public.projects"))[0].n, 0);
await q("select public.unlock_lead($1,$2,500,'cs_1')", [l1, A.id]);
await assert.rejects(() => convert(A.user, "lead", l1), /accepted contract value/, "an accepted quotation or contract value is required");
await assert.rejects(() => convert(A.user, "lead", l1, 0), /accepted contract value/);
await assert.rejects(() => convert(B.user, "lead", l1, 4200), /Lead not found/, "another business cannot convert it");

// ---------------------------------------------------------------- the conversion
await as(A.user, () => db.query("select public.add_lead_activity('lead',$1,'note','Wants a quote for a new unit')", [l1]));
const p1 = await convert(A.user, "lead", l1, 4200);
const proj = (await q("select * from public.projects where id=$1", [p1]))[0];
assert.equal(proj.status, "awarded");
assert.equal(Number(proj.contract_value), 4200);
assert.equal(proj.client_name, "Jane Doe");
assert.equal(proj.client_phone, "5125550100");
assert.equal(proj.client_email, "jane@x.com", "contact details are copied by the server");
assert.equal(proj.location, "Austin, Texas");
assert.equal(proj.description, "Upstairs unit warm");
assert.equal([proj.industry, proj.trade].join("/"), "Residential HVAC/AC repair");
assert.equal([proj.lead_kind, proj.lead_item_id].join(":"), `lead:${l1}`, "the project links to its lead");
const quote = (await q("select * from public.quotations where project_id=$1", [p1]))[0];
assert.equal([quote.status, Number(quote.amount_usd)].join("/"), "accepted/4200", "the accepted quotation is recorded and attached");
assert.equal((await q("select count(*)::int n from public.lead_conversions"))[0].n, 1, "the conversion is recorded");

// the lead stays, as Converted, with its purchase record and history
assert.equal((await q("select stage from public.lead_pipeline where item_id=$1", [l1]))[0].stage, "converted");
assert.equal((await q("select contractor_status s, unlock_ref r from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, A.id]))[0].r, "cs_1", "the purchase record is untouched");
const leadTl = (await as(A.user, () => db.query("select * from public.my_lead_activities('lead',$1)", [l1]))).rows;
assert.ok(leadTl.some((e) => e.type === "converted"), "the lead timeline records the conversion");
const projTl = (await as(A.user, () => db.query("select * from public.project_activities where project_id=$1 order by id", [p1]))).rows;
assert.ok(projTl.some((e) => e.type === "note" && /new unit/.test(e.body)), "the lead's notes come with the project");
assert.ok(projTl.some((e) => e.type === "converted"));

// ---------------------------------------------------------------- twice, and at the same moment: one project
assert.equal(await convert(A.user, "lead", l1, 9999), p1, "converting again returns the same project");
const both = await Promise.all([1, 2].map(() => convert(A.user, "lead", l1, 100)));
assert.deepEqual(both, [p1, p1]);
assert.equal((await q("select count(*)::int n from public.projects"))[0].n, 1, "never a second project");
assert.equal((await q("select count(*)::int n from public.quotations"))[0].n, 1, "nor a second quotation");
assert.equal(Number((await q("select contract_value v from public.projects"))[0].v), 4200);

// ---------------------------------------------------------------- privacy and write rules
assert.equal((await as(B.user, () => db.query("select * from public.projects"))).rows.length, 0, "another business sees no projects");
assert.equal((await as(B.user, () => db.query("select * from public.project_activities"))).rows.length, 0);
await assert.rejects(() => as(B.user, () => db.query("insert into public.project_tasks (project_id, title) values ($1,'x')", [p1])), /row-level security/, "nor adds to them");
await assert.rejects(() => as(A.user, () => db.query("insert into public.projects (listing_id, name, lead_kind, lead_item_id) values ($1,'Forged',$2,gen_random_uuid())", [A.id, "lead"])), /row-level security/, "a lead-linked project cannot be made by hand");
await assert.rejects(() => as(A.user, () => db.query("update public.projects set lead_item_id = null, lead_kind = null where id=$1", [p1])), /permission denied/, "the lead link cannot be edited");
await assert.rejects(() => as(A.user, () => db.query("update public.projects set listing_id = $2 where id=$1", [p1, B.id])), /permission denied/, "nor the owner");
await as(A.user, () => db.query("delete from public.projects where id=$1", [p1]));
assert.equal((await q("select count(*)::int n from public.projects where id=$1", [p1]))[0].n, 1, "a converted project cannot be deleted, so the link and history stay");
await assert.rejects(() => as(A.user, () => db.query("insert into public.project_activities (project_id, type, body) values ($1,'status','forged')", [p1])), /row-level security/, "the timeline cannot be forged");

// ---------------------------------------------------------------- managing a project
await as(A.user, () => db.query("update public.projects set status='in_progress', start_on='2030-02-01' where id=$1", [p1]));
await as(A.user, () => db.query("insert into public.project_tasks (project_id, title, assignee, due_on) values ($1,'Order condenser','Sam','2030-02-03')", [p1]));
await as(A.user, () => db.query("update public.project_tasks set done = true where project_id=$1", [p1]));
await as(A.user, () => db.query("insert into public.project_expenses (project_id, description, amount_usd) values ($1,'Condenser unit',1850.5)", [p1]));
await as(A.user, () => db.query("insert into public.project_team (project_id, name, role) values ($1,'Sam Lee','Technician')", [p1]));
await as(A.user, () => db.query("insert into public.project_documents (project_id, name, url) values ($1,'Signed quote','https://example.com/q.pdf')", [p1]));
await assert.rejects(() => as(A.user, () => db.query("insert into public.project_documents (project_id, name, url) values ($1,'Bad','javascript:alert(1)')", [p1])), /check/, "document links must be web addresses");
await as(A.user, () => db.query("insert into public.project_activities (project_id, type, body) values ($1,'note','Customer chose the 3-ton unit')", [p1]));
const bodies = (await as(A.user, () => db.query("select body from public.project_activities where project_id=$1", [p1]))).rows.map((r) => r.body).join("\n");
for (const re of [/Status: In Progress/, /Task added: Order condenser/, /Task done: Order condenser/, /Expense: Condenser unit \(\$1,850.50\)/, /Team member added: Sam Lee/, /Document added: Signed quote/, /3-ton unit/]) assert.match(bodies, re);

// ---------------------------------------------------------------- permits and bids convert too, from their own records
const permit = (await q("insert into public.public_permits (source, source_id, city, summary, description, address, people) values ('austin','p9','Austin','HVAC replace, office','Replace 3 rooftop units','5 Elm St','[{\"role\":\"Applicant\",\"company\":\"Elm Offices LLC\",\"name\":\"Pat Kim\",\"phone\":\"5125550111\",\"email\":\"pat@elm.com\"}]') returning id"))[0].id;
await save(A.user, A.id, permit, "permit");
await setStage(A.user, A.id, permit, "won", "permit");
await assert.rejects(() => convert(A.user, "permit", permit, 15000), /Unlock this lead first/, "a locked permit cannot convert");
await q("insert into public.opportunity_unlocks (listing_id, kind, item_id, unlock_cents, unlock_ref) values ($1,'permit',$2,1000,'cs_p')", [A.id, permit]);
const p2 = await convert(A.user, "permit", permit, 15000);
const pp = (await q("select * from public.projects where id=$1", [p2]))[0];
assert.deepEqual([pp.client_name, pp.client_company, pp.client_phone, pp.client_email, pp.location], ["Pat Kim", "Elm Offices LLC", "5125550111", "pat@elm.com", "5 Elm St, Austin"]);

console.log("projects tests passed");
