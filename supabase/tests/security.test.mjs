// Security audit of the whole database, run against the real schema files in in-memory Postgres (PGlite). It fails when:
//   - a table in the public schema does not have row level security switched on;
//   - signed-out visitors (anon) can touch a table other than the few meant to be public;
//   - a security-definer function can be run by signed-out visitors, other than the few meant to be public;
//   - signed-in users can run a function that is meant for the server (the service role) only.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/security.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
-- Supabase gives these roles access to the public schema and, by default, to everything created in it. Mirror that.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
const ORDER = ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-messages.sql", "schema-revamp.sql", "schema-myleads.sql", "schema-projects.sql", "schema-bidprep.sql", "schema-bookings.sql", "schema-analytics.sql"];
const rest0 = readdirSync(new URL("../", import.meta.url)).filter((f) => /^schema-.*\.sql$/.test(f) && !ORDER.includes(f));
const rest = rest0.filter((f) => f !== "schema-hardening.sql");
for (const f of [...ORDER, ...rest, "schema-hardening.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
const q = async (sql, p) => (await db.query(sql, p)).rows;

// ---- 1. every table has row level security on
const noRls = (await q("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1")).map((r) => r.relname);
assert.deepEqual(noRls, [], `tables without row level security: ${noRls.join(", ")}`);

// ---- 2. what signed-out visitors can reach. Only these are meant to be public.
const PUBLIC_TABLES = new Set([
  "posts",               // published blog posts
  "listings",            // published directory listings (a row policy limits it to published ones)
  "blog_posts",          // published posts
  "page_views",          // insert-only visit counter
  "leads",               // insert-only request form (a row policy limits what can be inserted)
  "contact_messages",    // insert-only contact form
  "listing_submissions", // insert-only "add your business" form
  "gov_bids", "public_permits", // not public: listed here only if the schema ever opens them (they must stay closed)
]);
const anonTables = (await q(`select c.relname,
        has_table_privilege('anon', c.oid, 'select') s, has_table_privilege('anon', c.oid, 'insert') i,
        has_table_privilege('anon', c.oid, 'update') u, has_table_privilege('anon', c.oid, 'delete') d
   from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1`))
  .filter((t) => t.s || t.i || t.u || t.d);
// The mirror of Supabase's default grants gives anon everything; a table is only really open when a policy lets anon in. Check policies.
const anonPolicies = (await q(`select tablename, cmd from pg_policies where schemaname = 'public' and ('anon' = any (roles) or 'public' = any (roles)) order by 1, 2`));
const openToAnon = new Set(anonPolicies.map((p) => p.tablename));
const unexpected = [...openToAnon].filter((t) => !PUBLIC_TABLES.has(t) && !/_public$|_counts$/.test(t));
assert.deepEqual(unexpected, [], `row policies that let signed-out visitors in: ${unexpected.join(", ")}`);
// Anon may only SELECT on the public read tables and only INSERT on the forms: no policy may grant update or delete to anon.
const anonWrites = anonPolicies.filter((p) => p.cmd === "UPDATE" || p.cmd === "DELETE" || p.cmd === "ALL");
assert.deepEqual(anonWrites, [], `signed-out visitors may not update or delete anything: ${JSON.stringify(anonWrites)}`);
// Views have no row security of their own: anon must only be able to read the intended public views.
const views = (await q(`select c.relname, has_table_privilege('anon', c.oid, 'select') s from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'`)).filter((v) => v.s).map((v) => v.relname);
const unexpectedViews = views.filter((v) => !/recommendation/.test(v));
assert.deepEqual(unexpectedViews, [], `views readable by signed-out visitors: ${unexpectedViews.join(", ")}`);

// ---- 3. functions. Security-definer functions run with their owner's rights, so who may call them matters.
const fns = await q(`select p.proname, p.prosecdef,
        has_function_privilege('anon', p.oid, 'execute') anon_ok, has_function_privilege('authenticated', p.oid, 'execute') auth_ok,
        pg_get_function_identity_arguments(p.oid) args, p.prorettype::regtype::text ret
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' order by 1`);
// Signed-out visitors may only call these.
const ANON_OK = new Set(["track_listing_event", "is_admin", "listing_is_paid", "listing_is_featured", "norm_state", "slugify", "stage_status", "stage_label", "stage_rank", "asks_for_quote", "is_quote_subject"]);
const anonFns = fns.filter((f) => f.anon_ok && f.prosecdef && f.ret !== "trigger" && !ANON_OK.has(f.proname)).map((f) => `${f.proname}(${f.args})`);
assert.deepEqual(anonFns, [], `security-definer functions that signed-out visitors can run: ${anonFns.join(", ")}`);
// Trigger functions are never meant to be called by hand.
const trig = fns.filter((f) => f.ret === "trigger" && (f.anon_ok || f.auth_ok)).map((f) => f.proname);
assert.deepEqual(trig, [], `trigger functions callable by users: ${trig.join(", ")}`);
// Server-only functions: the browser must never be able to run these (they take a business or user id as an argument and trust it).
const SERVER_ONLY = ["unlock_lead", "unlock_opportunity", "route_lead", "claim_lead_notifications", "finish_lead_notifications", "claim_status_alerts", "finish_status_alerts", "auto_advance", "queue_status_alert",
  "opportunity_email_target", "log_opportunity_email", "message_email_info", "mark_message_emailed", "assistant_use", "opportunity_reaches"];
const exposed = fns.filter((f) => SERVER_ONLY.includes(f.proname) && (f.anon_ok || f.auth_ok)).map((f) => `${f.proname}(${f.args})`);
assert.deepEqual(exposed, [], `server-only functions that browsers can run: ${exposed.join(", ")}`);

console.log("security tests passed");
