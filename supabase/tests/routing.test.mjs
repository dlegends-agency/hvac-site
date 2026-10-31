// Runs supabase/schema-contractors.sql in an in-memory Postgres (PGlite) with stubs for Supabase auth, and checks the contractor
// rules: lead routing, per-lead unlocking, locked fields for free accounts, email alert queueing and nearby matching.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/routing.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync(new URL("../schema-contractors.sql", import.meta.url), "utf8");
const db = new PGlite();

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') $$;
create table public.admin_users (user_id uuid primary key references auth.users (id));
create function public.is_admin() returns boolean language sql stable as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;
create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table public.listings (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  slug text not null unique, status text not null default 'pending', business_name text not null, description text, services text[] not null default '{}',
  emergency_service boolean not null default false, phone text, email text, website text, address text, city text not null, state text not null,
  postal_code text, service_areas text, source text not null default 'submitted', source_url text, attribution text,
  plan text not null default 'free'
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), status text not null default 'new',
  issue text not null default 'AC Not Cooling', urgency text not null default 'Immediately', country text not null default 'US', state text not null, city text not null,
  postal_code text not null default '78701', street text not null default '1 Main St', unit text, first_name text not null default 'Jane', last_name text not null default 'Doe',
  phone text not null default '5125550100', email text not null default 'jane@x.com', contact_method text not null default 'Phone', description text default 'Unit is blowing warm air',
  property_type text not null default 'Residential', property_status text not null default 'Homeowner', preferred_contact_time text, notes text
);
-- A listing from the old three-plan model, to check the migration.
insert into public.listings (slug, status, business_name, city, state, plan) values ('legacy', 'published', 'Legacy Premium', 'Nowhere', 'TX', 'premium');

-- Stand-in for the pg_net extension: records the calls the database would make.
create schema net;
create table net.calls (url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls values (url, headers, body) returning 1::bigint $$;
`);

await db.exec(SQL);
await db.exec(SQL); // must be safe to run twice
assert.equal((await db.query("select plan from public.listings where slug='legacy'")).rows[0].plan, "featured", "the old Premium tier becomes the one paid plan");
await assert.rejects(() => db.query("update public.listings set plan='premium' where slug='legacy'"), /listings_plan_check/, "only free and featured exist now");

// ---------------------------------------------------------------- helpers
const uid = async (email) => (await db.query("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
const past = new Date(Date.now() - 864e5).toISOString();
const future = new Date(Date.now() + 30 * 864e5).toISOString();
const listing = async (name, city, state, plan, { status = "published", until = null, areas = null, owned = true } = {}) => {
  const id = (await db.query(
    "insert into public.listings (slug, status, business_name, city, state, plan, plan_until, service_areas) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [name.toLowerCase().replace(/\W+/g, "-"), status, name, city, state, plan, until, areas],
  )).rows[0].id;
  const user = owned ? await uid(`${name}@x.com`) : null;
  if (owned) await db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [id, user]);
  return { id, user, name };
};
const lead = async (city, state, status = "new", zip = "78701") => (await db.query("insert into public.leads (city, state, status, postal_code) values ($1,$2,$3,$4) returning id", [city, state, status, zip])).rows[0].id;
const assigned = async (leadId) => (await db.query("select l.business_name n, a.source from public.lead_assignments a join public.listings l on l.id=a.listing_id where a.lead_id=$1 order by 1", [leadId])).rows;
const names = (rows) => rows.map((r) => r.n).sort();
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  try { return await fn(); } finally { await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
};
const asRole = async (role, fn) => { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec("reset role"); } };
const myLeads = (user) => as(user, async () => (await db.query("select * from public.my_leads()")).rows);

const A = await listing("Alpha Paid", "Austin", "TX", "featured");
const I = await listing("India Paid", "austin ", "Texas", "featured", { until: future });
const B = await listing("Bravo Paid", "Austin", "Texas", "featured");
const C = await listing("Charlie Paid", "Round Rock", "TX", "featured", { areas: "Pflugerville, Austin, Cedar Park" });
const J = await listing("Juliet Paid", "Austin", "tx", "featured");
const D = await listing("Delta Free", "Austin", "TX", "free");
await listing("Echo Pending", "Austin", "TX", "featured", { status: "pending" });
const F = await listing("Foxtrot Lapsed", "Austin", "TX", "featured", { until: past });
await listing("Golf NoOwner", "Austin", "TX", "featured", { owned: false });
await listing("Hotel Dallas", "Dallas", "TX", "featured");
await listing("Kilo Austin MN", "Austin", "MN", "featured");
const StL = await listing("Lima StLouis", "St. Louis", "MO", "free");

// ---------------------------------------------------------------- 1. routing: who receives a lead
// Paid accounts come first; at most 3 contractors; pending, unowned, other-city and other-state listings never receive it.
const l1 = await lead("Austin", "Texas");
let got = await assigned(l1);
assert.deepEqual(names(got), ["Alpha Paid", "Bravo Paid", "India Paid"], "three paid contractors fill the three places");
assert.ok(got.every((r) => r.source === "auto"));

// Rotation: whoever has not had a lead (or had one longest ago) goes next.
const l2 = await lead("Austin", "TX");
assert.deepEqual(names(await assigned(l2)), ["Alpha Paid", "Charlie Paid", "Juliet Paid"], "Charlie (service area) and Juliet had none yet");
for (let i = 0; i < 3; i++) await lead("austin", "tx");
assert.equal((await db.query("select count(*)::int n from public.lead_assignments where listing_id=$1", [D.id])).rows[0].n, 0, "a free account is not served while paid ones fill every place");
assert.equal((await db.query("select count(*)::int n from public.lead_assignments where listing_id=$1", [F.id])).rows[0].n, 0, "a lapsed plan counts as free");

// Free accounts DO receive leads when there is room, after the paid ones.
await listing("Bastrop Paid", "Bastrop", "TX", "featured");
await listing("Bastrop Free One", "Bastrop", "TX", "free");
await listing("Bastrop Free Two", "Bastrop", "TX", "free");
await listing("Bastrop Free Three", "Bastrop", "TX", "free");
assert.deepEqual(names(await assigned(await lead("Bastrop", "TX"))), ["Bastrop Free One", "Bastrop Free Two", "Bastrop Paid"], "paid first, then free accounts in turn");
assert.deepEqual(names(await assigned(await lead("St. Louis", "MO"))), ["Lima StLouis"], "a free account alone still gets the lead");

// Nothing for no match, the wrong state, spam; punctuation in a city name is safe.
assert.equal((await assigned(await lead("Houston", "Texas"))).length, 0, "no contractor in Houston");
assert.deepEqual(names(await assigned(await lead("Austin", "MN"))), ["Kilo Austin MN"], "state must match");
assert.equal((await assigned(await lead("Austin", "TX", "spam"))).length, 0, "spam is not routed");
assert.equal((await db.query("select public.route_lead($1)", [await lead("Austin (North) [x]", "TX")])).rows.length, 1, "special characters are safe");
assert.equal((await db.query("select public.route_lead($1) as n", [l1])).rows[0].n, 0, "routing again adds nobody twice");
const cntOf = async (id) => (await db.query("select count(*)::int n from public.lead_assignments where lead_id=$1", [id])).rows[0].n;
await db.query("delete from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, B.id]);
assert.equal((await db.query("select public.route_lead($1) as n", [l1])).rows[0].n, 1, "re-routing refills the one empty place");
assert.equal(await cntOf(l1), 3, "never more than 3 contractors per lead");
// Put lead 1 back to Alpha, India and Bravo for the checks below.
await db.query("delete from public.lead_assignments where lead_id=$1 and listing_id <> all($2)", [l1, [A.id, I.id]]);
await db.query("insert into public.lead_assignments (lead_id, listing_id, source) values ($1,$2,'auto')", [l1, B.id]);

// ---------------------------------------------------------------- 2. what a contractor sees: locked until unlocked
const locked = (await myLeads(A.user)).find((r) => r.id === l1);
assert.equal(locked.unlocked, false);
assert.deepEqual([locked.first_name, locked.last_name, locked.issue], ["Jane", "Doe", "AC Not Cooling"], "name and problem are visible");
for (const f of ["phone", "email", "street", "unit", "city", "state", "postal_code", "urgency", "description", "contact_method", "property_type", "property_status", "preferred_contact_time"]) {
  assert.equal(locked[f], null, `${f} is hidden until the lead is unlocked`);
}
assert.equal(locked.recipient_count, 3, "knows the request was shared with 3 contractors");
assert.ok(!("notes" in locked) && !("status" in locked), "admin-only lead columns are never exposed");
assert.equal((await myLeads(B.user)).some((r) => r.id === l2), false, "leads sent to others are invisible");
assert.equal((await myLeads(null)).length, 0, "no user, no leads");

// Status and notes need an unlocked lead.
await assert.rejects(() => as(A.user, () => db.query("select public.update_my_lead($1,'contacted','hi')", [l1])), /Unlock this lead first/);
await assert.rejects(() => as(D.user, () => db.query("select public.update_my_lead($1,'contacted','')", [l1])), /Lead not found/, "not the contractor's lead");

// Only the payment webhook (service role) can unlock, and only that contractor's copy opens.
await assert.rejects(() => asRole("authenticated", () => db.query("select public.unlock_lead($1,$2,500,'x')", [l1, A.id])), /permission denied/);
await assert.rejects(() => asRole("anon", () => db.query("select public.unlock_lead($1,$2,500,'x')", [l1, A.id])), /permission denied/);
assert.equal((await asRole("service_role", () => db.query("select public.unlock_lead($1,$2,500,'cs_first') as ok", [l1, A.id]))).rows[0].ok, true);
assert.equal((await asRole("service_role", () => db.query("select public.unlock_lead($1,$2,1000,'cs_second') as ok", [l1, A.id]))).rows[0].ok, true, "calling twice is harmless");
const paid = (await db.query("select unlock_cents c, unlock_ref r, unlocked_at is not null u from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, A.id])).rows[0];
assert.deepEqual(paid, { c: 500, r: "cs_first", u: true }, "the first payment is the one recorded");
assert.equal((await asRole("service_role", () => db.query("select public.unlock_lead($1,$2,500,'x') as ok", [l1, D.id]))).rows[0].ok, false, "no assignment, nothing to unlock");

const open = (await myLeads(A.user)).find((r) => r.id === l1);
assert.equal(open.unlocked, true);
assert.deepEqual([open.phone, open.email, open.street, open.city, open.state, open.postal_code, open.urgency, open.description, open.contact_method], ["5125550100", "jane@x.com", "1 Main St", "Austin", "Texas", "78701", "Immediately", "Unit is blowing warm air", "Phone"], "full details after paying");
assert.equal((await myLeads(B.user)).find((r) => r.id === l1).phone, null, "another contractor's copy stays locked");

await as(A.user, () => db.query("select public.update_my_lead($1,'contacted','called back')", [l1]));
let row = (await db.query("select contractor_status s, contacted_at c, contractor_notes n from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, A.id])).rows[0];
assert.ok(row.s === "contacted" && row.c && row.n === "called back");
await as(A.user, () => db.query("select public.update_my_lead($1,'new','')", [l1]));
assert.equal((await db.query("select contacted_at c from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, A.id])).rows[0].c, null, "back to new clears the contacted time");
await assert.rejects(() => as(A.user, () => db.query("select public.update_my_lead($1,'hacked','')", [l1])), /Invalid status/);

// ---------------------------------------------------------------- 3. permissions
await assert.rejects(() => asRole("anon", () => db.query("select public.route_lead($1)", [l1])), /permission denied/);
await assert.rejects(() => asRole("anon", () => db.query("select * from public.my_leads()")), /permission denied/);
await assert.rejects(() => asRole("authenticated", () => db.query("select public.route_lead($1)", [l1])), /permission denied/);
await assert.rejects(() => as(B.user, () => db.query("select public.admin_route_lead($1)", [l1])), /Admins only/);
const admin = await uid("admin@x.com");
await db.query("insert into public.admin_users values ($1)", [admin]);
assert.equal((await as(admin, async () => (await db.query("select public.admin_route_lead($1) as n", [await lead("Houston", "TX")])).rows[0].n)), 0);

// ---------------------------------------------------------------- 4. free accounts cannot edit the paid-only fields
const edit = (user, id, set, params = []) => as(user, () => db.query(`update public.listings set ${set} where id = $1`, [id, ...params]));
const read = async (id) => (await db.query("select business_name, phone, description, services, service_areas, plan from public.listings where id=$1", [id])).rows[0];

await edit(D.user, D.id, "business_name = 'Delta Free Renamed', phone = '555-0100', description = 'hacked about', services = '{AC}', service_areas = 'everywhere', plan = 'featured'");
let r = await read(D.id);
assert.equal(r.business_name, "Delta Free Renamed", "a free account can edit its name");
assert.equal(r.phone, "555-0100", "and phone");
assert.equal(r.description, null, "but not About");
assert.deepEqual(r.services, [], "not Services");
assert.equal(r.service_areas, null, "not Service areas");
assert.equal(r.plan, "free", "and can never give itself a plan");

await edit(A.user, A.id, "description = 'We fix AC fast', services = '{\"AC Repair\"}', service_areas = 'Austin, Pflugerville'");
r = await read(A.id);
assert.deepEqual([r.description, r.services, r.service_areas], ["We fix AC fast", ["AC Repair"], "Austin, Pflugerville"], "a paid account can");

await edit(F.user, F.id, "description = 'lapsed edit'");
assert.equal((await read(F.id)).description, null, "a lapsed plan is locked again");

await as(admin, () => db.query("update public.listings set description = 'admin wrote this', plan = 'free' where id = $1", [D.id]));
r = await read(D.id);
assert.deepEqual([r.description, r.plan], ["admin wrote this", "free"], "an admin can change anything");

// ---------------------------------------------------------------- 5. email alerts queue
await db.exec("update public.lead_notifications set sent_at = now()");
await db.exec("insert into public.notification_settings (id, endpoint, secret) values (1, 'https://example.test/api/notify/send', 's3cret')");
const callsBefore = (await db.query("select count(*)::int n from net.calls")).rows[0].n;
const n1 = await lead("Austin", "Texas");
const gotN1 = await assigned(n1);
const queued = (await db.query("select count(*)::int n from public.lead_notifications where lead_id=$1", [n1])).rows[0].n;
assert.equal(queued, gotN1.length, "one alert queued per contractor");
const calls = (await db.query("select * from net.calls offset $1", [callsBefore])).rows;
assert.equal(calls.length, gotN1.length, "sender pinged for each");
assert.equal(calls[0].headers["X-Notify-Secret"], "s3cret");

const claim = (n = 50) => asRole("service_role", async () => (await db.query("select * from public.claim_lead_notifications($1)", [n])).rows);
const claimed = (await claim()).filter((x) => gotN1.some((g) => g.n === x.business_name));
assert.equal(claimed.length, gotN1.length);
for (const x of claimed) assert.equal(x.email, `${x.business_name}@x.com`, "email goes to the owner's account address");
assert.equal((await claim()).length, 0, "a second sender gets nothing while the first holds the claim");
await asRole("service_role", () => db.query("select public.finish_lead_notifications($1::uuid[], $2::jsonb)", [[claimed[1].id], JSON.stringify({ [claimed[0].id]: "Resend 500" })]));
const st = (await db.query("select id, sent_at, last_error, claimed_at, attempts from public.lead_notifications where id = any($1)", [[claimed[0].id, claimed[1].id]])).rows;
const failed = st.find((x) => x.id === claimed[0].id), ok = st.find((x) => x.id === claimed[1].id);
assert.ok(ok.sent_at && ok.last_error === null);
assert.ok(!failed.sent_at && failed.last_error === "Resend 500" && failed.claimed_at === null && failed.attempts === 1);
assert.deepEqual((await claim()).map((x) => x.id), [claimed[0].id], "only the failed one is retried");
await db.query("update public.lead_notifications set attempts = 5, claimed_at = null where id = $1", [claimed[0].id]);
assert.equal((await claim()).length, 0, "gives up after 5 attempts");

await as(B.user, () => db.query("select public.set_my_email_alerts(false)"));
assert.equal((await db.query("select notify_email from public.listing_owners where listing_id=$1", [A.id])).rows[0].notify_email, true, "other contractors unaffected");
const n2 = await lead("Austin", "Texas");
const g2 = await assigned(n2);
const claimed2 = (await claim()).map((x) => x.business_name);
if (g2.some((g) => g.n === "Bravo Paid")) assert.ok(!claimed2.includes("Bravo Paid"), "an opted-out contractor gets no email");

for (const role of ["anon", "authenticated"]) {
  await asRole(role, async () => {
    await assert.rejects(() => db.query("select * from public.notification_settings"), /permission denied/);
    await assert.rejects(() => db.query("select * from public.lead_notifications"), /permission denied/);
    await assert.rejects(() => db.query("select * from public.claim_lead_notifications(5)"), /permission denied/);
    await assert.rejects(() => db.query("select * from public.zip_centroids"), /permission denied/);
  });
}

// ---------------------------------------------------------------- 6. nearby matching by ZIP code and travel radius
await db.exec(`insert into public.zip_centroids values
  ('78701', 30.2706, -97.7426), ('78626', 30.6600, -97.6900), ('76701', 31.5539, -97.1458), ('77002', 29.7568, -95.3657), ('19103', 39.9534, -75.1742)`);
assert.deepEqual((await db.query("select public.zip5('78701-1234') a, public.zip5(null) c, public.zip5('7870') d")).rows[0], { a: "78701", c: null, d: null });
const dist = (await db.query("select public.miles_between(30.2706,-97.7426,29.7568,-95.3657) m")).rows[0].m;
assert.ok(dist > 140 && dist < 152, `Austin to Houston is about 146 miles (got ${Math.round(dist)})`);

const zl = async (name, city, state, plan, zip, radius, extra = {}) => {
  const x = await listing(name, city, state, plan, extra);
  await db.query("update public.listings set postal_code=$1, service_radius_miles=$2 where id=$3", [zip, radius, x.id]);
  return x;
};
await zl("Zulu Georgetown", "Georgetown", "TX", "featured", "78626", 30);
await zl("Yankee Waco", "Waco", "TX", "featured", "76701", 30);
await zl("Xray Waco Far", "Waco", "TX", "featured", "76701", 100);
await zl("Whiskey Houston", "Houston", "TX", "featured", "77002", 100);
await zl("Tango Free", "Austin", "TX", "free", "78701", 50);

const mk = async (city, state, zip) => lead(city, state, "new", zip);
// The case from real life: a wrong city but a valid ZIP code still finds contractors, by each one's own travel radius.
assert.deepEqual(names(await assigned(await mk("Pennsylvania", "Texas", "78701"))), ["Tango Free", "Xray Waco Far", "Zulu Georgetown"], "paid within range first, then a free account");
await zl("Victor Paid", "Austin", "TX", "featured", "78701", 20);
await zl("Uniform Paid", "Austin", "TX", "featured", "78701", 5);
assert.deepEqual(names(await assigned(await mk("Pennsylvania", "Texas", "78701-4321"))), ["Uniform Paid", "Victor Paid", "Zulu Georgetown"], "ZIP+4 works; unused paid contractors, then the nearest");
const got0 = names(await assigned(await mk("Austin", "Texas", "00000")));
assert.equal(got0.length, 3, "an unknown ZIP is still routed by city");
assert.ok(!got0.includes("Zulu Georgetown") && !got0.includes("Xray Waco Far"), "unknown ZIP: contractors that match only by distance are not used");
assert.equal((await assigned(await mk("Philadelphia", "Pennsylvania", "19103"))).length, 0, "nobody within range of Philadelphia");
await assert.rejects(() => db.query("update public.listings set service_radius_miles = 3 where business_name = 'Zulu Georgetown'"), /service_radius/);
await assert.rejects(() => db.query("update public.listings set service_radius_miles = 500 where business_name = 'Zulu Georgetown'"), /service_radius/);

// ---------------------------------------------------------------- 7. old hand-assigned leads are carried over
const old = await lead("Dallas", "TX");
await db.query("update public.leads set assigned_listing_id=$1, assigned_at=now(), contractor_status='contacted', contractor_notes='old note' where id=$2", [StL.id, old]);
await db.exec(SQL);
assert.deepEqual((await db.query("select source, contractor_status s, contractor_notes n, unlocked_at from public.lead_assignments where lead_id=$1 and listing_id=$2", [old, StL.id])).rows[0], { source: "manual", s: "contacted", n: "old note", unlocked_at: null });

// ---------------------------------------------------------------- 8. problems never block saving a lead
await db.exec("update public.notification_settings set endpoint = null");
assert.ok(await lead("Austin", "TX"));
await db.exec("drop function net.http_post(text, jsonb, jsonb)");
await db.exec("update public.notification_settings set endpoint = 'https://example.test/x'");
const n3 = await lead("Austin", "TX");
assert.ok((await assigned(n3)).length > 0, "assignment still created when the ping fails");
assert.ok((await db.query("select count(*)::int n from public.lead_notifications where lead_id=$1", [n3])).rows[0].n > 0, "and the alert is still queued for the fallback");
await db.exec("alter table public.lead_assignments rename to lead_assignments_x");
assert.ok(await lead("Austin", "TX"), "lead still saved when routing breaks");
await db.exec("alter table public.lead_assignments_x rename to lead_assignments");

console.log("contractor SQL: all checks passed");
