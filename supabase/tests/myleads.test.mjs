// Loads the real schema files in order into in-memory Postgres (PGlite) with stubs for Supabase auth, then checks My Leads: the lead status
// in lead_pipeline stays in step with the older request status, the timeline records changes, notes can only be added to your own leads,
// and the receipts and timeline are private to the owner.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/myleads.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-revamp.sql", "schema-myleads.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-myleads.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated; grant select on public.lead_pipeline, public.lead_activities, public.listing_owners, public.listings to authenticated; grant insert, update, delete on public.lead_pipeline to authenticated; grant execute on all functions in schema public to authenticated");

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
  (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source) values ('AC Not Cooling','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100','jane@x.com','Phone','Residential','Homeowner',true,'new','homepage') returning id")) [0].id;
const stage = async (listing, kind, item) => (await q("select stage from public.lead_pipeline where listing_id=$1 and kind=$2 and item_id=$3", [listing, kind, item]))[0]?.stage;
const status = async (l, listing) => (await q("select contractor_status s from public.lead_assignments where lead_id=$1 and listing_id=$2", [l, listing]))[0].s;
const timeline = async (user, kind, item) => (await as(user, () => db.query("select * from public.my_lead_activities($1,$2)", [kind, item]))).rows;

// ---------------------------------------------------------------- a paid lead is added with a first timeline entry
const l1 = await lead();
await q("select public.unlock_lead($1,$2,500,'cs_test_abc')", [l1, A.id]);
await as(A.user, () => db.query("insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,'lead',$2,'Jane Doe')", [A.id, l1]));
assert.equal(await stage(A.id, "lead", l1), "saved");
let t = await timeline(A.user, "lead", l1);
assert.equal(t.length, 1);
assert.match(t[0].body, /Added to My Leads as New/);

// ---------------------------------------------------------------- the new status moves the old one, and is logged
await as(A.user, () => db.query("update public.lead_pipeline set stage='follow_up', follow_up_on='2030-01-15' where listing_id=$1 and kind='lead' and item_id=$2", [A.id, l1]));
assert.equal(await status(l1, A.id), "contacted", "Follow-up counts as contacted for the older status");
assert.ok((await q("select contacted_at from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, A.id]))[0].contacted_at, "contacted_at is set");
t = await timeline(A.user, "lead", l1);
assert.ok(t.some((e) => e.type === "status" && /Follow-up/.test(e.body)));
assert.ok(t.some((e) => e.type === "follow_up" && /Jan 15, 2030/.test(e.body)));
await as(A.user, () => db.query("update public.lead_pipeline set stage='won' where listing_id=$1 and kind='lead' and item_id=$2", [A.id, l1]));
assert.equal(await status(l1, A.id), "won");

// ---------------------------------------------------------------- the older status control moves the new stage
await as(A.user, () => db.query("select public.update_my_lead($1,'lost','not interested')", [l1]));
assert.equal(await stage(A.id, "lead", l1), "lost", "changing the request status the old way updates My Leads");
assert.equal(await status(l1, A.id), "lost");
await as(A.user, () => db.query("update public.lead_pipeline set stage='interested' where listing_id=$1 and kind='lead' and item_id=$2", [A.id, l1]));
assert.equal(await status(l1, A.id), "contacted");
assert.equal(await stage(A.id, "lead", l1), "interested", "the sync does not loop or overwrite the finer stage");

// ---------------------------------------------------------------- a request already worked the old way keeps its status when saved
const l2 = await lead();
await q("select public.unlock_lead($1,$2,500,'cs_test_def')", [l2, A.id]);
await as(A.user, () => db.query("select public.update_my_lead($1,'contacted','')", [l2]));
await as(A.user, () => db.query("insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,'lead',$2,'Jane Doe')", [A.id, l2]));
assert.equal(await stage(A.id, "lead", l2), "contacted", "saving does not reset the status");
assert.equal(await status(l2, A.id), "contacted");

// ---------------------------------------------------------------- notes, calls and emails
await as(A.user, () => db.query("select public.add_lead_activity('lead',$1,'note','Wants a quote for a new unit')", [l1]));
await as(A.user, () => db.query("select public.add_lead_activity('lead',$1,'call','')", [l1]));
t = await timeline(A.user, "lead", l1);
assert.equal(t[0].type, "call", "newest first");
assert.ok(t.some((e) => e.type === "note" && /new unit/.test(e.body)));
await assert.rejects(() => as(A.user, () => db.query("select public.add_lead_activity('lead',$1,'note','  ')", [l1])), /cannot be empty/);
await assert.rejects(() => as(A.user, () => db.query("select public.add_lead_activity('lead',$1,'status','hacked')", [l1])), /Invalid activity/, "the timeline cannot be forged");
await assert.rejects(() => as(B.user, () => db.query("select public.add_lead_activity('lead',$1,'note','mine now')", [l1])), /Lead not found/, "another business cannot write to it");

// ---------------------------------------------------------------- privacy
assert.equal((await timeline(B.user, "lead", l1)).length, 0, "another business sees no timeline");
assert.equal((await as(B.user, () => db.query("select * from public.lead_activities"))).rows.length, 0, "nor the table");
await assert.rejects(() => as(A.user, () => db.query("insert into public.lead_activities (listing_id, kind, item_id, type, body) values ($1,'lead',$2,'note','x')", [A.id, l1])), /permission denied/, "no direct writes");
const rA = (await as(A.user, () => db.query("select * from public.my_unlock_receipts()"))).rows;
assert.deepEqual(rA.map((r) => [r.kind, r.unlock_cents, r.unlock_ref]).sort(), [["lead", 500, "cs_test_abc"], ["lead", 500, "cs_test_def"]]);
assert.equal((await as(B.user, () => db.query("select * from public.my_unlock_receipts()"))).rows.length, 0, "receipts are private");

// ---------------------------------------------------------------- permits and bids use the same status, without touching requests
const permit = (await q("insert into public.public_permits (source, source_id, city, summary) values ('austin','p1','Austin','HVAC replace') returning id"))[0].id;
await as(A.user, () => db.query("insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,'permit',$2,'HVAC replace')", [A.id, permit]));
await as(A.user, () => db.query("update public.lead_pipeline set stage='interested' where listing_id=$1 and kind='permit' and item_id=$2", [A.id, permit]));
assert.equal((await timeline(A.user, "permit", permit)).length, 2);
await assert.rejects(() => as(A.user, () => db.query("update public.lead_pipeline set stage='nonsense' where listing_id=$1 and item_id=$2", [A.id, permit])), /check/);

console.log("my leads tests passed");
