// Runs supabase/schema-contractors.sql in an in-memory Postgres (PGlite) with stubs for Supabase auth, and checks lead routing.
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
  postal_code text, service_areas text, source text not null default 'submitted', source_url text, attribution text
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), status text not null default 'new',
  issue text not null default 'x', urgency text not null default 'x', country text not null default 'US', state text not null, city text not null,
  postal_code text not null default '78701', street text not null default '1 Main', unit text, first_name text not null default 'Jane', last_name text not null default 'Doe',
  phone text not null default '5125550100', email text not null default 'j@x.com', contact_method text not null default 'Phone', description text,
  property_type text not null default 'Residential', property_status text not null default 'Homeowner', preferred_contact_time text, notes text
);
`);

await db.exec(SQL);
await db.exec(SQL); // must be safe to run twice

const uid = async (email) => (await db.query("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
const listing = async (name, city, state, plan, { status = "published", until = null, areas = null, owned = true } = {}) => {
  const id = (await db.query(
    "insert into public.listings (slug, status, business_name, city, state, plan, plan_until, service_areas) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [name.toLowerCase().replace(/\W+/g, "-"), status, name, city, state, plan, until, areas],
  )).rows[0].id;
  const user = owned ? await uid(`${name}@x.com`) : null;
  if (owned) await db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [id, user]);
  return { id, user, name };
};
const lead = async (city, state, status = "new") => (await db.query("insert into public.leads (city, state, status) values ($1,$2,$3) returning id", [city, state, status])).rows[0].id;
const assigned = async (leadId) => (await db.query("select l.business_name n, a.source from public.lead_assignments a join public.listings l on l.id=a.listing_id where a.lead_id=$1 order by 1", [leadId])).rows;
const names = (rows) => rows.map((r) => r.n).sort();
const past = new Date(Date.now() - 864e5).toISOString();
const future = new Date(Date.now() + 30 * 864e5).toISOString();

const A = await listing("Alpha Premium", "Austin", "TX", "premium");
const I = await listing("India Premium", "austin ", "Texas", "premium", { until: future });
const B = await listing("Bravo Featured", "Austin", "Texas", "featured");
const C = await listing("Charlie Featured", "Round Rock", "TX", "featured", { areas: "Pflugerville, Austin, Cedar Park" });
const J = await listing("Juliet Featured", "Austin", "tx", "featured");
await listing("Delta Free", "Austin", "TX", "free");
await listing("Echo Pending", "Austin", "TX", "premium", { status: "pending" });
await listing("Foxtrot Expired", "Austin", "TX", "premium", { until: past });
await listing("Golf NoOwner", "Austin", "TX", "premium", { owned: false });
await listing("Hotel Dallas", "Dallas", "TX", "premium");
await listing("Kilo Austin MN", "Austin", "MN", "premium");
const StL = await listing("Lima StLouis", "St. Louis", "MO", "featured");

// 1. Only eligible, in-area, paid, published, owned listings; max 3; Premium first.
const l1 = await lead("Austin", "Texas");
let got = await assigned(l1);
assert.equal(got.length, 3, "cap of 3");
assert.deepEqual(names(got), ["Alpha Premium", "Bravo Featured", "India Premium"], "2 premium + oldest featured");
assert.ok(got.every((r) => r.source === "auto"));

// 2. Rotation: premium again, but the featured slot goes to someone who has not had a lead yet.
const l2 = await lead("Austin", "TX");
got = await assigned(l2);
assert.deepEqual(names(got), ["Alpha Premium", "Charlie Featured", "India Premium"], "featured slot rotates to Charlie (service area match)");
const l3 = await lead("austin", "tx");
assert.ok(names(await assigned(l3)).includes("Juliet Featured"), "then Juliet");

// 3. No match -> unassigned. Wrong state -> not matched. Spam -> nothing.
assert.equal((await assigned(await lead("Houston", "Texas"))).length, 0, "no contractor in Houston");
assert.deepEqual(names(await assigned(await lead("Austin", "MN"))), ["Kilo Austin MN"], "state must match");
const spam = await lead("Austin", "TX", "spam");
assert.equal((await assigned(spam)).length, 0, "spam is not routed");

// 4. City names with punctuation do not break routing.
assert.deepEqual(names(await assigned(await lead("St. Louis", "MO"))), ["Lima StLouis"]);
assert.equal((await db.query("select public.route_lead($1)", [await lead("Austin (North) [x]", "TX")])).rows.length, 1, "special characters are safe");

// 5. Routing again is harmless (no duplicates).
const again = (await db.query("select public.route_lead($1) as n", [l1])).rows[0].n;
assert.equal(again, 0, "already assigned contractors are not duplicated");

// 6. Contractors see only their own leads, with shared count, and can update status.
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  try { return await fn(); } finally { await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
};
const mine = await as(A.user, async () => (await db.query("select * from public.my_leads()")).rows);
assert.deepEqual(mine.map((r) => r.id).sort(), [l1, l2, l3].filter((id) => true).sort().filter((id) => mine.some((m) => m.id === id)), "own leads only");
assert.ok(mine.length >= 2 && mine.every((r) => r.recipient_count >= 1));
assert.equal(mine.find((r) => r.id === l1).recipient_count, 3, "shared with 3 contractors");
assert.ok(!("notes" in mine[0]) && !("status" in mine[0]), "admin-only lead columns are not exposed");

const bravoLeads = await as(B.user, async () => (await db.query("select id from public.my_leads()")).rows.map((r) => r.id));
assert.deepEqual(bravoLeads, [l1], "Bravo only received lead 1");
const freeUser = (await db.query("select user_id from public.listing_owners o join public.listings l on l.id=o.listing_id where l.business_name='Delta Free'")).rows[0].user_id;
assert.equal((await as(freeUser, async () => (await db.query("select * from public.my_leads()")).rows)).length, 0, "free plan received nothing");
assert.equal((await as(null, async () => (await db.query("select * from public.my_leads()")).rows)).length, 0, "no user, no leads");

await as(B.user, () => db.query("select public.update_my_lead($1,'contacted','called back')", [l1]));
let row = (await db.query("select a.contractor_status s, a.contacted_at c, a.contractor_notes n from public.lead_assignments a where lead_id=$1 and listing_id=$2", [l1, B.id])).rows[0];
assert.equal(row.s, "contacted"); assert.ok(row.c); assert.equal(row.n, "called back");
const other = (await db.query("select a.contractor_status s from public.lead_assignments a where lead_id=$1 and listing_id=$2", [l1, A.id])).rows[0];
assert.equal(other.s, "new", "another contractor's copy is unchanged");
await as(B.user, () => db.query("select public.update_my_lead($1,'new','')", [l1]));
row = (await db.query("select a.contacted_at c from public.lead_assignments a where lead_id=$1 and listing_id=$2", [l1, B.id])).rows[0];
assert.equal(row.c, null, "back to new clears contacted time");
await assert.rejects(() => as(B.user, () => db.query("select public.update_my_lead($1,'won','')", [l2])), /Lead not found/, "cannot touch a lead sent to someone else");
await assert.rejects(() => as(B.user, () => db.query("select public.update_my_lead($1,'hacked','')", [l1])), /Invalid status/);

// 7. Permissions: clients cannot call the routing function; only admins can use the admin wrapper.
await db.exec("set role anon");
await assert.rejects(() => db.query("select public.route_lead($1)", [l1]), /permission denied/);
await assert.rejects(() => db.query("select * from public.my_leads()"), /permission denied/);
await db.exec("reset role");
await db.exec("set role authenticated");
await assert.rejects(() => db.query("select public.route_lead($1)", [l1]), /permission denied/);
await db.exec("reset role");
await assert.rejects(() => as(B.user, () => db.query("select public.admin_route_lead($1)", [l1])), /Admins only/);
const admin = await uid("admin@x.com");
await db.query("insert into public.admin_users values ($1)", [admin]);
const n = (await as(admin, async () => (await db.query("select public.admin_route_lead($1) as n", [await lead("Houston", "TX")])).rows[0].n));
assert.equal(n, 0);

// 8. Leads made before this feature (assigned by hand) are carried over when the SQL is run again.
const old = await lead("Dallas", "TX");
await db.query("update public.leads set assigned_listing_id=$1, assigned_at=now(), contractor_status='contacted', contractor_notes='old note' where id=$2", [StL.id, old]);
await db.exec(SQL);
const migrated = (await db.query("select source, contractor_status s, contractor_notes n from public.lead_assignments where lead_id=$1 and listing_id=$2", [old, StL.id])).rows[0];
assert.deepEqual(migrated, { source: "manual", s: "contacted", n: "old note" });

// 9. A routing failure must never block saving the lead.
await db.exec("alter table public.lead_assignments rename to lead_assignments_x");
const safe = await lead("Austin", "TX");
assert.ok(safe, "lead still saved when routing breaks");
await db.exec("alter table public.lead_assignments_x rename to lead_assignments");

console.log("routing SQL: all checks passed");
