// Loads the real schema files in order into in-memory Postgres (PGlite) and checks the public_permits table: who can read it,
// that the same permit is not saved twice, and the value and residential/commercial checks.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/permits.test.mjs
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
`);
for (const f of ["schema.sql", "schema-permits.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-permits.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated, anon; grant execute on function public.is_admin() to authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const admin = (await q("insert into auth.users (email) values ('admin@x.com') returning id"))[0].id;
const other = (await q("insert into auth.users (email) values ('other@x.com') returning id"))[0].id;
await q("insert into public.admin_users (user_id) values ($1)", [admin]);

const insert = (over = {}) => {
  const r = { source: "dallas", source_id: "COM-ME-1", city: "Dallas", trade: "HVAC", value_usd: 128571.43, property_class: "commercial", summary: "Commercial HVAC: cooling tower, $128,571 at 1 A St, Dallas.", ...over };
  const keys = Object.keys(r);
  return q(`insert into public.public_permits (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, keys.map((k) => r[k]));
};
await insert();
await insert({ source: "austin", source_id: "2026-1 MP", city: "Austin", value_usd: null, property_class: "residential" });

await assert.rejects(() => insert(), /unique|duplicate/i, "the same permit is not saved twice");
await insert({ source: "austin", source_id: "COM-ME-1" }); // the same number in another city is a different permit
await assert.rejects(() => insert({ source_id: "x", property_class: "mixed" }), /property_class/, "residential, commercial or unknown only");
await assert.rejects(() => insert({ source_id: "y", value_usd: -5 }), /value_usd/, "no negative values");
await q("update public.public_permits set people = $1::jsonb where source_id = 'COM-ME-1' and source = 'dallas'", [JSON.stringify([{ role: "Mechanical Contractor", company: "Team Services", phone: "(512) 994-3000" }])]);
assert.equal((await q("select people->0->>'company' c from public.public_permits where source_id = 'COM-ME-1' and source = 'dallas'"))[0].c, "Team Services", "the people on the permit are kept");
assert.deepEqual((await q("select people from public.public_permits where source = 'austin' and source_id = '2026-1 MP'"))[0].people, [], "none by default");
await assert.rejects(() => insert({ source_id: "z", summary: null }), /null value/, "every permit has a summary");
await assert.rejects(() => insert({ source_id: "p", trade: "Plumbing" }), /hvac_only|trade/, "only HVAC permits are kept");

// anything that is not HVAC and was saved before the rule existed is removed when the script is run again
await db.exec("alter table public.public_permits drop constraint public_permits_hvac_only; alter table public.public_permits drop constraint public_permits_trade_check");
await insert({ source_id: "old-roof", trade: "Roofing" });
await db.exec(read("schema-permits.sql"));
assert.equal((await q("select count(*)::int n from public.public_permits where source_id = 'old-roof'"))[0].n, 0, "non-HVAC permits are removed");
await assert.rejects(() => insert({ source_id: "p2", trade: "Roofing" }), /hvac_only/, "and refused afterwards");

// upsert (what the importer does) updates in place
await q(`insert into public.public_permits (source, source_id, city, trade, summary) values ('dallas','COM-ME-1','Dallas','HVAC','changed')
         on conflict (source, source_id) do update set trade = excluded.trade, summary = excluded.summary`);
assert.equal((await q("select summary from public.public_permits where source='dallas' and source_id='COM-ME-1'"))[0].summary, "changed");
assert.equal((await q("select count(*)::int n from public.public_permits"))[0].n, 3);

// who can read it
assert.equal((await as(admin, () => db.query("select * from public.public_permits"))).rows.length, 3, "an admin reads the permits");
assert.equal((await as(other, () => db.query("select * from public.public_permits"))).rows.length, 0, "a signed-in person who is not an admin sees nothing");
await assert.rejects(() => as(admin, () => db.query("insert into public.public_permits (source, source_id, city, summary) values ('x','1','x','x')")), /permission denied/, "even an admin cannot write from the browser");
// remembered contractor emails: admin read only
await q("insert into public.contractor_contacts (key, company, email, found) values ('phone:5129943000','Team Services','info@teamservicestx.com', true)");
assert.equal((await as(admin, () => db.query("select * from public.contractor_contacts"))).rows.length, 1, "an admin reads the remembered emails");
assert.equal((await as(other, () => db.query("select * from public.contractor_contacts"))).rows.length, 0, "nobody else does");
await assert.rejects(() => as(admin, () => db.query("insert into public.contractor_contacts (key) values ('x')")), /permission denied/, "and nobody writes from the browser");
await db.exec("set role anon");
await assert.rejects(() => db.query("select * from public.public_permits"), /permission denied/, "the public has no access");
await db.exec("reset role");

console.log("permits SQL: all checks passed");
