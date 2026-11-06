// Loads the real schema files in order into in-memory Postgres (PGlite) with stubs for Supabase auth, then checks the request flow log
// (lead_events), the admin flow-health numbers and the contractor performance and history functions.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/flow.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-flow.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated; grant select on public.lead_events, public.listing_owners, public.listings to authenticated; grant execute on all functions in schema public to authenticated; revoke all on function public.log_lead_event(uuid, uuid, text, text) from authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const uid = async (email) => (await q("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))[0].id;
const admin = await uid("admin@x.com");
await q("insert into public.admin_users (user_id) values ($1)", [admin]);

const mkListing = async (name, city, owner) => {
  const id = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code) values ($1,'published',$2,$3,'Texas','78701') returning id", [name.toLowerCase().replace(/\W+/g, "-"), name, city]))[0].id;
  const user = await uid(`${name}@x.com`);
  if (owner) await q("insert into public.listing_owners (listing_id,user_id) values ($1,$2)", [id, user]);
  return { id, user };
};
const A = await mkListing("Acme HVAC", "Austin", true);
const B = await mkListing("Bravo Air", "Austin", true);
const lead = async (city, status = "new", source = "homepage") =>
  (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source) values ('AC Not Cooling','Immediately','US','Texas',$1,'78701','1 Main St','Jane','Doe','5125550100','jane@x.com','Phone','Residential','Homeowner',true,$2,$3) returning id", [city, status, source]))[0].id;
const events = (id) => q("select kind, detail, listing_id from public.lead_events where lead_id=$1 order by id", [id]);
const kinds = async (id) => (await events(id)).map((e) => e.kind);

// ---------------------------------------------------------------- the steps of a request, in order
const l1 = await lead("Austin");
assert.deepEqual(await kinds(l1), ["received", "assigned", "alert_queued", "assigned", "alert_queued", "routed"], "received first, then each business it went to, then the summary");
assert.equal((await events(l1)).at(-1).detail, "2 businesses");
assert.equal((await events(l1))[0].detail, "homepage");

const l2 = await lead("Nowhere");
assert.deepEqual(await kinds(l2), ["received", "no_match"], "a request nobody matched is logged as such");
const l3 = await lead("Austin", "spam");
assert.deepEqual(await kinds(l3), ["received", "spam"], "spam is logged and not sent anywhere");

// unlock, contact, win
await q("select public.unlock_lead($1,$2,500,'pi_123')", [l1, A.id]);
await as(A.user, () => db.query("select public.update_my_lead($1,'contacted','called him')", [l1]));
await as(A.user, () => db.query("select public.update_my_lead($1,'won','booked')", [l1]));
await as(A.user, () => db.query("select public.update_my_lead($1,'new','undo')", [l1]));
let list = (await events(l1)).filter((e) => e.listing_id === A.id).map((e) => [e.kind, e.detail]);
assert.deepEqual(list.filter(([k]) => ["unlocked", "contacted", "won", "reopened"].includes(k)), [["unlocked", "$5.00"], ["contacted", null], ["won", null], ["reopened", null]], "unlock price and each status change by the business");
await q("update public.lead_assignments set unlocked_at = now() where lead_id=$1 and listing_id=$2", [l1, B.id]);
assert.equal((await events(l1)).find((e) => e.kind === "unlocked" && e.listing_id === B.id).detail, "free or by an admin");

// email alerts
await q("update public.lead_notifications set sent_at = now() where lead_id=$1 and listing_id=$2", [l1, A.id]);
await q("update public.lead_notifications set last_error = 'Resend 422: domain not verified' where lead_id=$1 and listing_id=$2", [l1, B.id]);
const alertKinds = (await events(l1)).filter((e) => e.kind.startsWith("alert_") && e.kind !== "alert_queued");
assert.deepEqual(alertKinds.map((e) => [e.kind, e.listing_id === A.id ? "A" : "B"]), [["alert_sent", "A"], ["alert_failed", "B"]]);
assert.equal(alertKinds[1].detail, "Resend 422: domain not verified");

// status changes by an admin, and removing a business
await q("update public.leads set status='contacted' where id=$1", [l1]);
await q("delete from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, B.id]);
const tail = (await events(l1)).slice(-2).map((e) => e.kind);
assert.deepEqual(tail, ["lead_status", "unassigned"]);
await q("delete from public.leads where id=$1", [l3]); // deleting a lead (and its log) must not fail
assert.equal((await q("select count(*)::int n from public.lead_events where lead_id=$1", [l3]))[0].n, 0);

// ---------------------------------------------------------------- who can read the log
assert.ok((await as(admin, () => db.query("select * from public.lead_events"))).rows.length > 10, "an admin reads the log");
assert.equal((await as(A.user, () => db.query("select * from public.lead_events"))).rows.length, 0, "a contractor cannot read the log table");
await assert.rejects(() => as(A.user, () => db.query("select public.log_lead_event($1,null,'x')", [l1])), /permission denied/, "nobody can write to the log by hand");

// ---------------------------------------------------------------- admin health
await q("update public.leads set created_at = now() - interval '2 hours' where id=$1", [l2]); // never matched, old enough
await q("update public.lead_assignments set unlocked_at = now() - interval '3 days', contractor_status = 'new' where lead_id=$1 and listing_id=$2", [l1, A.id]);
const health = (await as(admin, () => db.query("select public.admin_flow_health() as h"))).rows[0].h;
assert.equal(health.unmatched, 1, "the old request nobody received");
assert.equal(health.alerts_failed, 1);
assert.equal(health.unlocked_not_contacted, 1);
assert.ok(health.leads_24h >= 1 && health.unlocks_30d >= 1);
const unmatched = (await as(admin, () => db.query("select * from public.admin_unmatched_leads()"))).rows;
assert.deepEqual(unmatched.map((r) => r.id), [l2]);
await assert.rejects(() => as(A.user, () => db.query("select public.admin_flow_health()")), /Admins only/);
await assert.rejects(() => as(A.user, () => db.query("select * from public.admin_unmatched_leads()")), /Admins only/);

// ---------------------------------------------------------------- contractor performance and history
const lead2 = await lead("Austin");
await q("update public.lead_assignments set unlocked_at = now(), unlock_cents = 500, contractor_status = 'contacted', contacted_at = assigned_at + interval '3 hours' where lead_id=$1 and listing_id=$2", [lead2, A.id]);
await q("update public.lead_assignments set contractor_status = 'won', contacted_at = assigned_at + interval '1 hour', unlocked_at = now(), unlock_cents = 500 where lead_id=$1 and listing_id=$2", [l1, A.id]);
const perf = (await as(A.user, () => db.query("select public.my_performance() as p"))).rows[0].p;
assert.deepEqual([perf.received, perf.unlocked, perf.contacted, perf.won, perf.waiting_to_unlock, perf.spent_cents], [2, 2, 2, 1, 0, 1000]);
assert.equal(Number(perf.median_hours_to_contact), 2, "the middle of 1 hour and 3 hours");
const other = (await as(B.user, () => db.query("select public.my_performance() as p"))).rows[0].p;
assert.equal(other.received, 1, "a business sees only its own numbers");
const nobody = (await as(await uid("nobody@x.com"), () => db.query("select public.my_performance() as p"))).rows[0].p;
assert.deepEqual([nobody.received, nobody.spent_cents], [0, 0]);

const mine = (user, id) => as(user, () => db.query("select * from public.my_lead_events($1)", [id])).then((r) => r.rows);
const history = await mine(A.user, l1);
assert.ok(history.length >= 4 && history[0].kind === "received", "starts with the request arriving");
const bad = history.filter((e) => ["routed", "no_match", "alert_queued", "alert_failed", "lead_status", "unassigned"].includes(e.kind));
assert.equal(bad.length, 0, "no internal steps and nothing about other businesses");
assert.equal(history.filter((e) => e.kind === "assigned").length, 1, "only its own assignment");
assert.ok(!JSON.stringify(history).includes("jane") && !JSON.stringify(history).includes("5125550100"), "never the customer's details");
assert.deepEqual(await mine(await uid("nobody2@x.com"), l1), [], "someone who did not receive the lead sees nothing");
assert.deepEqual(await mine(B.user, l2), [], "nor a business that did not get that request");

// ---------------------------------------------------------------- requests from before this script get their first steps
await q("delete from public.lead_events");
await db.exec(read("schema-flow.sql"));
const first = await kinds(lead2);
assert.ok(first.includes("received") && first.includes("assigned") && first.includes("unlocked"), "backfilled with real times");
await db.exec(read("schema-flow.sql"));
assert.equal((await kinds(lead2)).length, first.length, "the backfill runs once");

console.log("flow SQL: all checks passed");
