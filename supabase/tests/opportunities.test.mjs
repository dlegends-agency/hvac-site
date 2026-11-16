// Loads the real schema files in order into in-memory Postgres (PGlite) and checks how permits and government bids reach contractors:
// only contractors whose business reaches the job see it, phone/email/website stay hidden until that business pays, one business's
// payment never unlocks another's, and contractors cannot read the raw tables.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/opportunities.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-bids.sql"));
await db.exec(read("schema-opportunities.sql")); // safe to run twice, and running bids again must not re-open the tables
await db.exec("grant usage on schema auth, public to authenticated, anon, service_role; grant execute on function public.is_admin() to authenticated; grant select on public.listing_owners to authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const uid = async (email) => (await q("insert into auth.users (email) values ($1) returning id", [email]))[0].id;
const business = async (name, city, zip, { radius = 30, areas = null, status = "published" } = {}) => {
  const id = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code,service_areas,service_radius_miles) values ($1,$2,$3,$4,'Texas',$5,$6,$7) returning id", [name.toLowerCase().replace(/\W+/g, "-"), status, name, city, zip, areas, radius]))[0].id;
  const user = await uid(`${name}@x.com`);
  await q("insert into public.listing_owners (listing_id,user_id) values ($1,$2)", [id, user]);
  return { id, user };
};
// Austin 78701, Round Rock 78664 (about 17 miles), Dallas 75201 (about 180 miles).
for (const [zip, lat, lng] of [["78701", 30.2711, -97.7437], ["78664", 30.5083, -97.6789], ["75201", 32.7876, -96.7985], ["77001", 29.7604, -95.3698]]) {
  await q("insert into public.zip_centroids (zip, lat, lng) values ($1,$2,$3)", [zip, lat, lng]);
}
const Austin = await business("Austin Air", "Austin", "78701");
const RoundRock = await business("RoundRock Air", "Round Rock", "78664", { radius: 30 }); // reaches Austin by distance
const Dallas = await business("Dallas Air", "Dallas", "75201");
const Pending = await business("Pending Air", "Austin", "78701", { status: "pending" });
const Listed = await business("Listed Air", "Georgetown", null, { areas: "Austin, Cedar Park" }); // reaches Austin by its listed cities
const Houston = await business("Houston Air", "Houston", "77001");
const customer = await uid("customer@x.com");
const admin = await uid("admin@x.com");
await q("insert into public.admin_users (user_id) values ($1)", [admin]);

const people = JSON.stringify([{ role: "Mechanical contractor", company: "D3 Mechanical", name: "Dan", phone: "(512) 806-7500", email: "dan@d3.com", website: "https://d3.com", address: "1 Main" }]);
const permit = (await q("insert into public.public_permits (source, source_id, city, zip, trade, summary, contractor_name, people, source_url) values ('austin','2026-1 MP','Austin','78701','HVAC','Residential HVAC: replace.','D3 Mechanical',$1::jsonb,'https://city/record') returning id", [people]))[0].id;
await q("insert into public.public_permits (source, source_id, city, zip, trade, summary, people) values ('dallas','D-1','Dallas','75201','HVAC','Commercial HVAC.',$1::jsonb)", [people]);
const contacts = JSON.stringify([{ name: "Pat Lee", title: "Contracting Officer", phone: "713-555-0100", email: "pat@va.gov" }]);
const bid = (await q("insert into public.gov_bids (notice_id, title, notice_type, summary, city, state, zip, contacts, sam_url, info_url) values ('n1','Replace chiller','Solicitation','s','Houston','TX','77001',$1::jsonb,'https://sam.gov/x','https://info') returning id", [contacts]))[0].id;
await q("insert into public.gov_bids (notice_id, title, notice_type, summary, city, state, zip, contacts) values ('n2','Austin AHU','Solicitation','s','Austin','TX','78701',$1::jsonb)", [contacts]);
await q("insert into public.gov_bids (notice_id, title, notice_type, summary, state, contacts) values ('n3','Somewhere in Texas','Solicitation','s','TX',$1::jsonb)", [contacts]);

const permits = (u) => as(u.user, async () => (await db.query("select * from public.my_permits()")).rows);
const bids = (u) => as(u.user, async () => (await db.query("select * from public.my_bids()")).rows);

// ---- who gets what: by city, by a listed city, or by distance from the business address ----
assert.deepEqual((await permits(Austin)).map((p) => p.city), ["Austin"], "an Austin business gets the Austin permit, not Dallas");
assert.deepEqual((await permits(RoundRock)).map((p) => p.city), ["Austin"], "a business 17 miles away reaches it within its travel radius");
assert.deepEqual((await permits(Listed)).map((p) => p.city), ["Austin"], "a business that lists Austin as a service area gets it");
assert.deepEqual((await permits(Dallas)).map((p) => p.city), ["Dallas"]);
assert.equal((await permits(Houston)).length, 0, "Houston is out of range of both");
assert.equal((await permits(Pending)).length, 0, "an unapproved listing gets nothing");
assert.deepEqual((await bids(Houston)).map((b) => b.title), ["Replace chiller"], "a Houston business gets the Houston bid");
assert.deepEqual((await bids(Austin)).map((b) => b.title), ["Austin AHU"]);
assert.equal((await bids(Dallas)).length, 0, "a notice with no place in range is not sent");
await q("update public.listings set service_radius_miles = 5 where id = $1", [RoundRock.id]);
assert.equal((await permits(RoundRock)).length, 0, "a shorter travel radius drops it");
await q("update public.listings set service_radius_miles = 30 where id = $1", [RoundRock.id]);

// ---- locked: everything except phone, email, website and the original links ----
const locked = (await permits(Austin))[0];
assert.equal(locked.unlocked, false);
assert.deepEqual([locked.summary, locked.contractor_name, locked.address ?? null, locked.zip], ["Residential HVAC: replace.", "D3 Mechanical", null, "78701"], "the permit details are visible");
assert.deepEqual(locked.people, [{ role: "Mechanical contractor", company: "D3 Mechanical", name: "Dan", address: "1 Main" }], "name and company stay, phone, email and website do not");
assert.equal(locked.source_url, null, "the city record link would show the contact, so it is hidden too");
const lockedBid = (await bids(Houston))[0];
assert.deepEqual(lockedBid.contacts, [{ name: "Pat Lee", title: "Contracting Officer" }], "the contracting officer's name is visible, phone and email are not");
assert.deepEqual([lockedBid.sam_url, lockedBid.info_url, lockedBid.unlocked], [null, null, false]);
assert.ok(!JSON.stringify([locked, lockedBid]).match(/806-7500|dan@d3|pat@va|713-555/), "no phone or email anywhere in what a locked contractor receives");

// ---- paying: only the server (service role) unlocks, only for a lead in the business's area, and only for that business ----
await assert.rejects(() => as(Austin.user, () => db.query("select public.unlock_opportunity('permit',$1,$2,500,'x')", [permit, Austin.id])), /permission denied/, "a contractor cannot unlock for free");
await db.exec("set role service_role");
assert.equal((await db.query("select public.unlock_opportunity('permit',$1,$2,500,'cs_1') as ok", [permit, Houston.id])).rows[0].ok, false, "not in Houston's area, so it cannot be bought");
assert.equal((await db.query("select public.opportunity_reaches('permit',$1,$2) as ok", [permit, Austin.id])).rows[0].ok, true);
assert.equal((await db.query("select public.opportunity_reaches('bid',$1,$2) as ok", [bid, Austin.id])).rows[0].ok, false);
assert.equal((await db.query("select public.unlock_opportunity('permit',$1,$2,500,'cs_1') as ok", [permit, Austin.id])).rows[0].ok, true);
assert.equal((await db.query("select public.unlock_opportunity('permit',$1,$2,500,'cs_1') as ok", [permit, Austin.id])).rows[0].ok, true, "safe to run twice");
assert.equal((await db.query("select public.unlock_opportunity('bid',$1,$2,500,'cs_2') as ok", [bid, Houston.id])).rows[0].ok, true);
await db.exec("reset role");
assert.equal((await q("select count(*)::int n from public.opportunity_unlocks"))[0].n, 2, "each payment is recorded once");

const open = (await permits(Austin))[0];
assert.equal(open.unlocked, true);
assert.equal(open.people[0].phone, "(512) 806-7500");
assert.equal(open.people[0].email, "dan@d3.com");
assert.equal(open.source_url, "https://city/record");
assert.equal((await permits(RoundRock))[0].unlocked, false, "another business's copy stays locked");
assert.equal((await permits(RoundRock))[0].people[0].phone, undefined);
const openBid = (await bids(Houston))[0];
assert.deepEqual([openBid.contacts[0].email, openBid.sam_url], ["pat@va.gov", "https://sam.gov/x"]);

// ---- nobody reads the raw tables except admins ----
for (const table of ["public_permits", "gov_bids", "opportunity_unlocks"]) {
  const n = (u) => as(u, () => db.query(`select * from public.${table}`)).then((r) => r.rows.length);
  assert.equal(await n(admin), table === "opportunity_unlocks" ? 2 : table === "gov_bids" ? 3 : 2, `an admin reads ${table}`);
  assert.equal(await n(Austin.user), 0, `a business owner cannot read ${table} directly`);
  assert.equal(await n(customer), 0, `a customer cannot read ${table}`);
}
await db.exec("set role anon");
await assert.rejects(() => db.query("select * from public.my_permits()"), /permission denied/);
await assert.rejects(() => db.query("select * from public.my_bids()"), /permission denied/);
await db.exec("reset role");
assert.equal((await as(customer, async () => (await db.query("select * from public.my_permits()")).rows)).length, 0, "a customer account gets nothing");

// ---- daily email summary of what is new in each contractor's area ----
await assert.rejects(() => as(Austin.user, () => db.query("select public.queue_opportunity_digests()")), /permission denied/, "only the server queues summaries");
const svc = async (sql, p) => { await db.exec("set role service_role"); try { return (await db.query(sql, p)).rows; } finally { await db.exec("reset role"); } };
await q("update public.listing_owners set notify_email = false where listing_id = $1", [Dallas.id]); // Dallas switched alerts off
assert.equal((await svc("select public.queue_opportunity_digests() as n"))[0].n, 4, "Austin, Round Rock, Listed and Houston have something new; Dallas opted out, Pending is not published");
const digests = await q("select l.business_name n, d.permits, d.bids from public.opportunity_digests d join public.listings l on l.id = d.listing_id order by 1");
assert.deepEqual(digests.map((d) => [d.n, d.permits, d.bids]), [["Austin Air", 1, 1], ["Houston Air", 0, 1], ["Listed Air", 1, 1], ["RoundRock Air", 1, 1]]);
assert.equal((await svc("select public.queue_opportunity_digests() as n"))[0].n, 0, "nothing new since the last summary, so nothing is queued");
await q("insert into public.public_permits (source, source_id, city, zip, trade, summary, people) values ('austin','NEW-1','Austin','78701','HVAC','Residential HVAC: new ac.', $1::jsonb)", [people]);
assert.equal((await svc("select public.queue_opportunity_digests() as n"))[0].n, 3, "a new Austin permit reaches the three Austin-area businesses");
const claimed = await svc("select * from public.claim_opportunity_digests(10)");
assert.equal(claimed.length, 7, "all seven are claimed once");
assert.ok(claimed.every((c) => c.email.endsWith("@x.com")), "each goes to the owner's account email");
assert.ok(!JSON.stringify(claimed).match(/806-7500|dan@d3|pat@va|713-555/), "no phone or email of a contractor or officer is in a summary");
assert.equal((await svc("select count(*)::int n from public.claim_opportunity_digests(10)"))[0].n, 0, "a claimed summary is not handed out twice");
const ids = claimed.map((c) => c.id);
await svc("select public.finish_opportunity_digests($1::uuid[], $2::jsonb)", [ids.slice(0, 6), JSON.stringify({ [ids[6]]: "Resend 403" })]);
assert.deepEqual((await q("select count(*) filter (where sent_at is not null)::int sent, count(*) filter (where last_error is not null)::int failed from public.opportunity_digests"))[0], { sent: 6, failed: 1 }, "failures are recorded for a retry");
const switched = await q("select count(*)::int n from public.opportunity_digests d join public.listing_owners o using (listing_id) where not o.notify_email");
assert.equal(switched[0].n, 0, "an opted-out business is never queued");

// ---- emailing the contact on an unlocked permit or bid, through the site
const target = async (kind, item, listingId, index = 0) => (await svc("select * from public.opportunity_email_target($1,$2,$3,$4)", [kind, item, listingId, index]))[0];
await assert.rejects(() => as(Austin.user, () => db.query("select * from public.opportunity_email_target('permit',$1,$2,0)", [permit, Austin.id])), /permission denied/, "a business cannot read the address through it");
await assert.rejects(() => as(Austin.user, () => db.query("select public.log_opportunity_email($1,'permit',$2,'a@b.com','s','b')", [Austin.id, permit])), /permission denied/);
let t = await target("permit", permit, Austin.id);
assert.deepEqual([t.unlocked, t.to_email, t.to_name, t.optout, t.sent_to_today, t.sent_total_today], [true, "dan@d3.com", "Dan", false, 0, 0], "an unlocked permit: the address comes from the permit, with its name");
assert.equal((await target("permit", permit, RoundRock.id)).unlocked, false, "a business that has not paid cannot email the contact");
assert.equal((await target("permit", permit, Austin.id, 5)).to_email, null, "a contact that is not on the permit has no address");
t = await target("bid", bid, Houston.id);
assert.deepEqual([t.unlocked, t.to_email, t.to_name], [true, "pat@va.gov", "Pat Lee"], "an unlocked bid: the contracting officer");
assert.equal((await target("bid", bid, Austin.id)).unlocked, false);
await svc("select public.log_opportunity_email($1,'permit',$2,'Dan@D3.com','Hello','Body text')", [Austin.id, permit]);
await svc("select public.log_opportunity_email($1,'permit',$2,'dan@d3.com','Hello again','Body text')", [Austin.id, permit]);
await svc("select public.log_opportunity_email($1,'permit',$2,'dan@d3.com','Failed one','Body text','Resend 403')", [Austin.id, permit]);
t = await target("permit", permit, Austin.id);
assert.deepEqual([t.sent_to_today, t.sent_total_today], [2, 2], "emails to the contact and in total are counted (any capitals), failed ones are not");
assert.equal((await target("permit", permit, RoundRock.id)).sent_to_today, 0, "another business starts at zero");
await q("insert into public.email_optouts (email) values ('dan@d3.com')");
assert.equal((await target("permit", permit, Austin.id)).optout, true, "an address on the opt-out list is flagged");
await assert.rejects(() => q("insert into public.email_optouts (email) values ('NOPE@X.COM')"), /check/, "opt-outs are stored in lower case");
assert.equal((await q("select count(*)::int n from public.opportunity_emails"))[0].n, 3);
for (const table of ["opportunity_emails", "email_optouts"]) {
  assert.equal((await as(Austin.user, () => db.query(`select * from public.${table}`))).rows.length, 0, `a business cannot read ${table}`);
  assert.ok((await as(admin, () => db.query(`select * from public.${table}`))).rows.length > 0, `an admin reads ${table}`);
}

console.log("opportunities SQL: all checks passed");
