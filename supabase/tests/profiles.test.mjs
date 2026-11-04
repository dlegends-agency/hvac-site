// Runs supabase/schema-contractors.sql and supabase/schema-profiles.sql in an in-memory Postgres (PGlite) with stubs for Supabase
// auth, and checks the profile rules: verified mark follows ownership, license check is cleared when the number changes, hours are
// a paid feature, public submissions cannot set marks, and only approved + confirmed recommendations are public.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/profiles.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const db = new PGlite();

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
-- Like Supabase: null when there is no request role (SQL editor, database jobs).
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
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
  phone text not null default '5125550100', email text not null default 'jane@x.com', contact_method text not null default 'Phone', description text default 'x',
  property_type text not null default 'Residential', property_status text not null default 'Homeowner', preferred_contact_time text, notes text
);
create schema net;
create table net.calls (url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls values (url, headers, body) returning 1::bigint $$;
`);

// A listing that already had an approved owner before the profiles script is run.
await db.exec(read("schema-contractors.sql"));
const uid = async (email) => (await db.query("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
const early = (await db.query("insert into public.listings (slug, status, business_name, city, state) values ('early','published','Early Owner','Austin','Texas') returning id")).rows[0].id;
await db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [early, await uid("early@x.com")]);

await db.exec(read("schema-profiles.sql"));
await db.exec(read("schema-profiles.sql")); // must be safe to run twice
const q = async (sql, params) => (await db.query(sql, params)).rows;
assert.ok((await q("select verified_at from public.listings where id=$1", [early]))[0].verified_at, "an owner approved before this script counts as verified");

// Run something as a request role (and optionally a signed-in user).
const as = async (role, user, fn) => {
  await db.query("select set_config('request.jwt.claim.role', $1, false), set_config('request.jwt.claim.sub', $2, false)", [role ?? "", user ?? ""]);
  try { return await fn(); } finally { await db.query("select set_config('request.jwt.claim.role', '', false), set_config('request.jwt.claim.sub', '', false)"); }
};
const row = async (id) => (await q("select * from public.listings where id=$1", [id]))[0];
const featured = new Date(Date.now() + 30 * 864e5).toISOString();
const hours = JSON.stringify({ mon: { open: "08:00", close: "17:00" } });

const admin = await uid("admin@x.com");
await db.query("insert into public.admin_users (user_id) values ($1)", [admin]);

// ---------------------------------------------------------------- verified follows ownership
const mk = async (slug, plan = "free", until = null) =>
  (await q("insert into public.listings (slug, status, business_name, city, state, plan, plan_until) values ($1,'published',$1,'Austin','Texas',$2,$3) returning id", [slug, plan, until]))[0].id;
const a = await mk("acme", "featured", featured);
assert.equal((await row(a)).verified_at, null);
const owner = await uid("owner@x.com");
await as("authenticated", admin, () => db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [a, owner]));
assert.ok((await row(a)).verified_at, "approving a claim (done by an admin) marks the listing verified");
await as("authenticated", admin, () => db.query("delete from public.listing_owners where listing_id=$1", [a]));
assert.equal((await row(a)).verified_at, null, "removing the owner removes the mark");
await db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [a, owner]); // SQL editor
assert.ok((await row(a)).verified_at);

// ---------------------------------------------------------------- what an owner can change
const stamp = (await row(a)).verified_at;
await as("authenticated", owner, () => db.query("update public.listings set verified_at=null, license_verified_at=now(), license_number='TACLB1', business_hours=$2 where id=$1", [a, hours]));
let r = await row(a);
assert.equal(r.verified_at.getTime(), stamp.getTime(), "an owner cannot clear or change the verified mark");
assert.equal(r.license_verified_at, null, "an owner cannot mark their own license as verified");
assert.equal(r.license_number, "TACLB1");
assert.deepEqual(r.business_hours, { mon: { open: "08:00", close: "17:00" } }, "a paid listing may set hours");

await db.query("update public.listings set license_verified_at=now() where id=$1", [a]); // an admin check, from the SQL editor
assert.ok((await row(a)).license_verified_at);
await as("authenticated", owner, () => db.query("update public.listings set phone='5125550101' where id=$1", [a]));
assert.ok((await row(a)).license_verified_at, "other edits keep the license check");
await as("authenticated", owner, () => db.query("update public.listings set license_number='TACLB2' where id=$1", [a]));
assert.equal((await row(a)).license_verified_at, null, "a changed number needs checking again");
await as("authenticated", owner, () => db.query("update public.listings set license_number=null where id=$1", [a]));
assert.equal((await row(a)).license_number, null, "the license number is optional");

await as("authenticated", admin, () => db.query("update public.listings set license_number='TACLA9', license_verified_at=now() where id=$1", [a]));
assert.ok((await row(a)).license_verified_at, "an admin can record a check");

// a free listing cannot set hours; a lapsed one cannot either
const f = await mk("free-co");
await db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [f, await uid("f@x.com")]);
const fOwner = (await q("select user_id from public.listing_owners where listing_id=$1", [f]))[0].user_id;
await as("authenticated", fOwner, () => db.query("update public.listings set business_hours=$2, license_number='TACLB77' where id=$1", [f, hours]));
r = await row(f);
assert.equal(r.business_hours, null, "hours are a paid feature");
assert.equal(r.license_number, "TACLB77", "a license number is available on the free plan");
const lapsed = await mk("lapsed", "featured", new Date(Date.now() - 864e5).toISOString());
const lOwner = await uid("l@x.com");
await db.query("insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [lapsed, lOwner]);
await as("authenticated", lOwner, () => db.query("update public.listings set business_hours=$2 where id=$1", [lapsed, hours]));
assert.equal((await row(lapsed)).business_hours, null, "a lapsed plan is treated as free");

// the check on the shape of hours
await assert.rejects(() => db.query("update public.listings set business_hours='[1]'::jsonb where id=$1", [a]), /listings_business_hours_check/);
await assert.rejects(() => db.query("update public.listings set license_number=$2 where id=$1", [a, "x".repeat(41)]), /license_number/);

// ---------------------------------------------------------------- public submissions
await as("anon", null, () => db.query(
  "insert into public.listings (slug, status, business_name, city, state, plan, plan_until, verified_at, license_verified_at, business_hours, license_number, google_place_id) values ('spam','pending','Spam Co','Austin','Texas','featured',$1,now(),now(),$2,'TACLB5','ChIJ0123456789abcdef') ",
  [featured, hours]));
r = await row((await q("select id from public.listings where slug='spam'"))[0].id);
assert.deepEqual([r.plan, r.plan_until, r.verified_at, r.license_verified_at, r.business_hours, r.google_place_id], ["free", null, null, null, null, null], "a public submission is always free and unverified");
assert.equal(r.license_number, "TACLB5", "but it may carry a license number, which stays unchecked");
await as("authenticated", admin, () => db.query("insert into public.listings (slug, status, business_name, city, state, plan, verified_at) values ('by-admin','published','By Admin','Austin','Texas','featured', now())"));
assert.equal((await row((await q("select id from public.listings where slug='by-admin'"))[0].id)).plan, "featured", "an admin may create a paid listing");
await as("service_role", null, () => db.query("insert into public.listings (slug, status, business_name, city, state, plan) values ('by-agent','pending','By Agent','Austin','Texas','featured')"));
assert.equal((await row((await q("select id from public.listings where slug='by-agent'"))[0].id)).plan, "featured", "server code (service role) is not restricted");

// ---------------------------------------------------------------- recommendations
const rec = async (listing, email, status = "pending", confirmed = false) =>
  (await q("insert into public.listing_recommendations (listing_id, author_name, author_email, body, token_hash, status, email_confirmed_at) values ($1,'Maria L.',$2,'They fixed our AC the same day and were fair.', 'hash', $3, $4) returning id",
    [listing, email, status, confirmed ? new Date().toISOString() : null]))[0].id;
await rec(a, "one@x.com", "approved", true);
await rec(a, "two@x.com", "approved", false);
await rec(a, "three@x.com", "pending", true);
await rec(a, "four@x.com", "rejected", true);
await assert.rejects(() => rec(a, "ONE@x.com"), /listing_recommendations_one_per_email/, "one per email per business, ignoring case");
await rec(f, "one@x.com", "approved", true); // the same person may recommend a different business

const pub = await as("anon", null, async () => { await db.exec("set role anon"); try { return await q("select * from public.listing_recommendations_public where listing_id=$1", [a]); } finally { await db.exec("reset role"); } });
assert.equal(pub.length, 1, "only approved and email-confirmed recommendations are public");
assert.deepEqual(Object.keys(pub[0]).sort(), ["author_name", "body", "created_at", "id", "listing_id"], "no email address and no token in the public view");
const counts = await q("select * from public.listing_recommendation_counts order by total");
assert.deepEqual(counts.map((c) => c.total), [1, 1]);
assert.equal((await q("select relrowsecurity from pg_class where relname='listing_recommendations'"))[0].relrowsecurity, true, "the table itself is private");
assert.deepEqual((await q("select policyname from pg_policies where tablename='listing_recommendations'")).map((p) => p.policyname), ["Admins manage recommendations"], "no public or owner access to the table");
await assert.rejects(() => db.query("insert into public.listing_recommendations (listing_id, author_name, author_email, body, token_hash) values ($1,'M','a@b.co','too short','h')", [a]), /check/);

console.log("profiles SQL: all checks passed");
