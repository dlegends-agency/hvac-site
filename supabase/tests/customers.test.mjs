// Loads the real schema files in order into in-memory Postgres (PGlite) with stubs for Supabase auth, then checks customer accounts
// (my_requests) and that lock-direct-inserts.sql closes the public insert doors.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/customers.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-profiles.sql", "schema-customers.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-customers.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to anon, authenticated; grant select, insert on public.leads, public.contact_messages, public.listings, public.listing_private to anon, authenticated; grant execute on all functions in schema public to authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (role, user, fn) => {
  await db.query("select set_config('request.jwt.claim.role',$1,false), set_config('request.jwt.claim.sub',$2,false)", [role, user ?? ""]);
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const uid = async (email, confirmed = true) => (await q("insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id", [email, confirmed ? new Date().toISOString() : null]))[0].id;

// ---------------------------------------------------------------- before the lock: the public forms can write directly
const leadSql = "insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment) values ('AC Not Cooling','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100',$1,'Phone','Residential','Homeowner',true)";
await as("anon", null, () => db.query(leadSql, ["before@x.com"]));
await as("anon", null, () => db.query("insert into public.contact_messages (name,email,topic,message) values ('Jo','jo@x.com','General','Hello there friend')"));

// ---------------------------------------------------------------- customer accounts
const biz = (await q("insert into public.listings (slug,status,business_name,city,state,phone) values ('acme-austin','published','Acme HVAC','Austin','Texas','5125550111') returning id"))[0].id;
const hidden = (await q("insert into public.listings (slug,status,business_name,city,state) values ('pending-co','pending','Pending Co','Austin','Texas') returning id"))[0].id;
const ann = await uid("ann@x.com");
const bob = await uid("bob@x.com");
const carol = await uid("carol@x.com", false); // email not confirmed

const mk = async (email, customer = null, status = "new") =>
  (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, customer_id, status) values ('Furnace Repair','Soon','US','Texas','Austin','78701','1 Main St','A','B','1',$1,'Phone','Residential','Homeowner',true,$2,$3) returning id", [email, customer, status]))[0].id;
const l1 = await mk("ann@x.com", ann);            // linked to her account
const l2 = await mk("ANN@x.com");                  // sent earlier, same email, not linked
const l3 = await mk("bob@x.com", bob);             // someone else's
const l4 = await mk("ann@x.com", ann, "spam");     // spam is never shown
const l5 = await mk("carol@x.com");                // carol has not confirmed her email

await q("insert into public.lead_assignments (lead_id, listing_id, contractor_status, contacted_at, contractor_notes) values ($1,$2,'contacted', now(), 'secret note')", [l1, biz]);
await q("insert into public.lead_assignments (lead_id, listing_id) values ($1,$2)", [l1, hidden]); // an unpublished listing is not shown

const mine = (user) => as("authenticated", user, () => db.query("select * from public.my_requests()")).then((r) => r.rows);
let rows = await mine(ann);
assert.deepEqual(rows.map((r) => r.id).sort(), [l1, l2].sort(), "her linked request and her older one with the same confirmed email, not bob's and not spam");
const first = rows.find((r) => r.id === l1);
assert.equal(first.businesses.length, 1, "only published businesses");
assert.deepEqual(Object.keys(first.businesses[0]).sort(), ["city", "contacted_at", "name", "phone", "sent_at", "slug", "state", "status"], "public business details and status only");
assert.equal(first.businesses[0].status, "contacted");
assert.ok(!JSON.stringify(first).includes("secret note"), "never the contractor's private notes");
assert.deepEqual((await mine(bob)).map((r) => r.id), [l3]);
assert.deepEqual(await mine(carol), [], "an unconfirmed email address does not unlock older requests (and carol has none linked)");
await assert.rejects(() => as("anon", null, () => db.query("select * from public.my_requests()")), /permission denied/, "signed-out visitors cannot call it");

// ---------------------------------------------------------------- the lock
await db.exec(read("lock-direct-inserts.sql"));
await db.exec(read("lock-direct-inserts.sql")); // safe to run twice
await assert.rejects(() => as("anon", null, () => db.query(leadSql, ["after@x.com"])), /row-level security/, "no direct lead inserts from the browser");
await assert.rejects(() => as("authenticated", ann, () => db.query(leadSql, ["after@x.com"])), /row-level security/, "not even when signed in");
await assert.rejects(() => as("anon", null, () => db.query("insert into public.contact_messages (name,email,topic,message) values ('Jo','jo@x.com','General','Hello there friend')")), /row-level security/);
const addListing = (role, user, status = "pending") => as(role, user, () => db.query("insert into public.listings (slug,status,business_name,city,state) values ($1,$2,'Xy Co','Austin','Texas')", [`x-${Math.random().toString(36).slice(2, 8)}`, status]));
await assert.rejects(() => addListing("anon", null), /row-level security/, "no anonymous listing submissions");
await addListing("authenticated", ann); // a signed-in contractor can still add their business
await assert.rejects(() => addListing("authenticated", ann, "published"), /row-level security/, "but only as pending");
// the service role (the new /api/submit endpoints) bypasses row level security, so it is unaffected
console.log("customers SQL: all checks passed");
