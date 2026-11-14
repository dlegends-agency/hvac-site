// Loads the real schema files in order into in-memory Postgres (PGlite) and checks the two lead tables: gov_bids (SAM.gov) and
// public_permits. Who can read each (admins and business owners, nobody else), that nothing can be written from the browser, and
// that a notice is saved once. Run: npm i --no-save @electric-sql/pglite && node supabase/tests/bids.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email varchar(255), email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create schema net; create table net.calls (url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls values (url, headers, body) returning 1::bigint $$;
`);
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-bids.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated, anon; grant execute on function public.is_admin() to authenticated; grant select on public.listing_owners to authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const uid = async (email) => (await q("insert into auth.users (email) values ($1) returning id", [email]))[0].id;
const admin = await uid("admin@x.com");
await q("insert into public.admin_users (user_id) values ($1)", [admin]);
const owner = await uid("owner@x.com");
const listing = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code) values ('acme','published','Acme HVAC','Houston','Texas','77001') returning id"))[0].id;
await q("insert into public.listing_owners (listing_id,user_id) values ($1,$2)", [listing, owner]);
const stranger = await uid("customer@x.com");

await q("insert into public.gov_bids (notice_id, title, notice_type, summary, city, state, contacts) values ('n1','Replace chiller','Solicitation','Solicitation: Replace chiller in Houston, TX.','Houston','TX',$1::jsonb)", [JSON.stringify([{ name: "Pat Lee", email: "pat@va.gov" }])]);
await q("insert into public.public_permits (source, source_id, city, trade, summary) values ('austin','2026-1 MP','Austin','HVAC','Residential HVAC: replace furnace.')");

await assert.rejects(() => q("insert into public.gov_bids (notice_id, title, notice_type, summary) values ('n1','dup','Solicitation','x')"), /unique|duplicate/i, "a notice is saved once");
await assert.rejects(() => q("insert into public.gov_bids (notice_id, title, notice_type) values ('n2','no summary','Solicitation')"), /null value/, "every bid has a summary");
assert.deepEqual((await q("select contacts from public.gov_bids where notice_id='n1'"))[0].contacts, [{ name: "Pat Lee", email: "pat@va.gov" }], "the contracting contacts are kept");

for (const table of ["gov_bids", "public_permits"]) {
  const n = (user) => as(user, () => db.query(`select * from public.${table}`)).then((r) => r.rows.length);
  assert.equal(await n(admin), 1, `an admin reads ${table}`);
  assert.equal(await n(owner), 1, `a business owner reads ${table}`);
  assert.equal(await n(stranger), 0, `a customer sees no ${table}`);
  await assert.rejects(() => as(owner, () => db.query(`delete from public.${table}`)), /permission denied/, `a business owner cannot change ${table}`);
  await assert.rejects(() => as(admin, () => db.query(`update public.${table} set summary = 'x'`)), /permission denied/, `nobody writes ${table} from the browser`);
  await db.exec("set role anon");
  await assert.rejects(() => db.query(`select * from public.${table}`), /permission denied/, `the public has no access to ${table}`);
  await db.exec("reset role");
}
assert.equal((await as(owner, () => db.query("select public.is_business_owner() as b"))).rows[0].b, true);
assert.equal((await as(stranger, () => db.query("select public.is_business_owner() as b"))).rows[0].b, false);
await db.exec("set role anon");
await assert.rejects(() => db.query("select public.is_business_owner()"), /permission denied/, "anon cannot ask");
await db.exec("reset role");

console.log("bids SQL: all checks passed");
