// Listing analytics: visitors are counted once, rubbish and the business own owners are ignored, nobody reads the table, owners read their own numbers.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/analytics.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-messages.sql", "schema-revamp.sql", "schema-myleads.sql", "schema-projects.sql", "schema-bidprep.sql", "schema-bookings.sql", "schema-analytics.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec("grant usage on schema auth, public to authenticated; grant select on public.listing_owners, public.listings, public.project_documents, public.project_activities to authenticated; grant select, insert, update, delete on public.lead_pipeline to authenticated; grant execute on all functions in schema public to authenticated; revoke execute on function public.unlock_lead(uuid, uuid, int, text), public.claim_status_alerts(int), public.auto_advance(uuid, text, uuid, text, text), public.log_opportunity_email(uuid, text, uuid, text, text, text, text) from authenticated");

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
const run = (user, sql, p) => as(user, () => db.query(sql, p));
const one = async (user, sql, p) => (await run(user, sql, p)).rows[0];
const count = async (sql, p) => (await q(sql, p))[0].n;

const track = (slug, event, session = "sess-aaaaaaaa", extra = {}) =>
  db.query("select public.track_listing_event($1,$2,$3,$4,$5,$6)", [slug, event, session, extra.device ?? "desktop", extra.ref ?? null, extra.where ?? "directory"]);
const asAnon = async (fn) => {
  await db.exec("set role anon");
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const stats = async (user, days = 30) => (await run(user, "select public.my_listing_analytics($1) as a", [days])).rows[0].a;

// A makes itself a paid (featured) listing; B stays free.
await q("update public.listings set plan='featured', plan_until = now() + interval '30 days' where id=$1", [A.id]);
const slugA = (await q("select slug from public.listings where id=$1", [A.id]))[0].slug;
const slugB = (await q("select slug from public.listings where id=$1", [B.id]))[0].slug;

// ---- visitors (signed out) are counted; repeats are not
await asAnon(async () => {
  await track(slugA, "impression");
  await track(slugA, "impression"); // a refresh inside the hour: the same impression
  await track(slugA, "impression", "sess-aaaaaaaa", { where: "city" }); // another place on the site is its own
  await track(slugA, "view");
  await track(slugA, "view"); // refresh
  await track(slugA, "view", "sess-bbbbbbbb", { device: "mobile", ref: "www.google.com" });
  await track(slugA, "call", "sess-bbbbbbbb", { device: "mobile" });
  await track(slugA, "website", "sess-bbbbbbbb", { device: "mobile" });
  await track(slugB, "view", "sess-cccccccc");
});
assert.equal(await count("select count(*)::int n from public.listing_events where listing_id=$1 and event='impression'", [A.id]), 2, "an impression is one per browser per place per hour");
assert.equal(await count("select count(*)::int n from public.listing_events where listing_id=$1 and event='view'", [A.id]), 2, "a refresh is not a second view");

// ---- rubbish is ignored
await asAnon(async () => {
  await track("no-such-business", "view");
  await track(slugA, "hack");
  await track(slugA, "view", "x"); // not a real browser id
  await track(slugA, "view", "sess-dddddddd", { device: "<script>", ref: "x".repeat(300) });
});
assert.equal(await count("select count(*)::int n from public.listing_events"), 8, "unknown listings, events and ids are dropped; an odd device or long referrer is cleaned");
const odd = (await q("select device, char_length(referrer) r from public.listing_events where session_id='sess-dddddddd'"))[0];
assert.deepEqual([odd.device, odd.r], [null, 100], "a made-up device is dropped and a long referrer is cut");

// ---- the business's own owners are not visitors
await run(A.user, "select public.track_listing_event($1,'view','sess-eeeeeeee','desktop',null,'listing')", [slugA]);
assert.equal(await count("select count(*)::int n from public.listing_events where session_id='sess-eeeeeeee'"), 0, "the owner looking at its own listing is not counted");
await run(B.user, "select public.track_listing_event($1,'view','sess-ffffffff','desktop',null,'listing')", [slugA]);
assert.equal(await count("select count(*)::int n from public.listing_events where session_id='sess-ffffffff'"), 1, "another business looking at it is");

// ---- nobody reads the table, or another business's numbers
await assert.rejects(() => run(A.user, "select * from public.listing_events"), /permission denied/);
await assert.rejects(() => asAnon(() => db.query("select * from public.listing_events")), /permission denied/);
await assert.rejects(() => asAnon(() => db.query("select public.my_listing_analytics(30)")), /permission denied/, "signed-out visitors cannot read analytics");

// ---- the owner's numbers
const a = await stats(A.user);
assert.deepEqual([a.days, a.featured_now], [30, true]);
assert.equal(a.totals.impressions, 2);
assert.equal(a.totals.featured_impressions, 2, "impressions while on a paid plan are counted as featured");
assert.deepEqual([a.totals.views, a.totals.visitors], [4, 4], "the other business and three visitors viewed it (sess-a, sess-b, sess-d, sess-f)");
assert.deepEqual([a.totals.calls, a.totals.websites, a.totals.emails, a.totals.directions], [1, 1, 0, 0]);
assert.deepEqual(a.placements, { directory: 1, city: 1 });
assert.equal(a.devices.mobile, 1);
assert.ok(a.sources.some((s) => s.name === "www.google.com") && a.sources.some((s) => s.name === "Direct or unknown"), "traffic sources");
assert.equal(a.daily.length, 30, "one row for every day, even quiet ones");
assert.equal(a.daily.at(-1).views, 4, "today");
assert.equal(a.daily[0].views, 0);
const b = await stats(B.user, 7);
assert.deepEqual([b.days, b.featured_now, b.totals.views, b.totals.featured_impressions], [7, false, 1, 0], "a free listing is counted, but not as featured");
assert.equal((await stats(A.user, 1)).days, 7, "the shortest range is 7 days");
assert.equal((await stats(A.user, 9999)).days, 365);

// ---- the previous period, and requests received
await q("insert into public.listing_events (listing_id, event, session_id, created_at) values ($1,'view','sess-old-1111', now() - interval '40 days'), ($1,'view','sess-old-2222', now() - interval '45 days')", [A.id]);
const lead = (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source, description) values ('AC','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100','jane@x.com','Phone','Residential','Homeowner',true,'new','homepage','x') returning id"))[0].id;
await q("insert into public.lead_assignments (lead_id, listing_id, source) values ($1,$2,'auto') on conflict do nothing", [lead, A.id]);
const a2 = await stats(A.user);
assert.equal(a2.before.views, 2, "the 30 days before are counted for comparison");
assert.equal(a2.totals.views, 4, "and are not mixed into this period");
assert.equal(a2.leads.received, 1);
assert.equal((await stats(B.user)).leads.received, 0 + (await count("select count(*)::int n from public.lead_assignments where listing_id=$1 and assigned_at > now() - interval '30 days'", [B.id])));

console.log("analytics tests passed");
