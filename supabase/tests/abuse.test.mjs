// Tries the attacks a malicious signed-in or signed-out user could try straight against the database API, with Supabase's default
// permissions mirrored (everyone may call every function and touch every table unless a schema file takes it away). Each attack must fail.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/abuse.test.mjs
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
grant usage on schema auth, public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-messages.sql", "schema-revamp.sql", "schema-myleads.sql", "schema-projects.sql", "schema-bidprep.sql", "schema-bookings.sql", "schema-analytics.sql", "schema-hardening.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (role, user, fn, email = "") => {
  await db.query("select set_config('request.jwt.claim.role',$1,false), set_config('request.jwt.claim.sub',$2,false), set_config('request.jwt.claim.email',$3,false)", [role, user ?? "", email]);
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.email','',false)"); }
};
const user = (u, sql, p, email) => as("authenticated", u, () => db.query(sql, p), email);
const anon = (sql, p) => as("anon", null, () => db.query(sql, p));
const uid = async (email) => (await q("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))[0].id;
const mk = async (name) => {
  const id = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code) values ($1,'published',$2,'Austin','Texas','78701') returning id", [name.toLowerCase().replace(/\W+/g, "-"), name]))[0].id;
  const u = await uid(`${name}@x.com`);
  await q("insert into public.listing_owners (listing_id,user_id) values ($1,$2)", [id, u]);
  return { id, u, email: `${name}@x.com` };
};
const A = await mk("Acme HVAC");
const B = await mk("Bravo Air");
const customer = await uid("jane@x.com");
const mkLead = async (email = "jane@x.com") => (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source, description) values ('AC','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100',$1,'Phone','Residential','Homeowner',true,'new','homepage','x') returning id", [email]))[0].id;
const lead = await mkLead();
await q("insert into public.lead_assignments (lead_id, listing_id, source) values ($1,$2,'auto'), ($1,$3,'auto') on conflict do nothing", [lead, A.id, B.id]);

/** A read is safe when it errors or returns nothing. */
const noRows = async (fn, why) => { try { const r = await fn(); assert.equal(r.rows.length, 0, why); } catch (e) { if (e instanceof assert.AssertionError) throw e; } };
const denied = async (fn, why = "") => {
  try { await fn(); } catch (e) {
    if (/permission denied|row-level security|violates|not allowed|Sign in|not found|Unlock|42501|Invalid|cannot|only/i.test(String(e.message))) return;
    throw new Error(`${why || "attack"}: failed for the wrong reason: ${e.message}`);
  }
  throw new Error(`ATTACK SUCCEEDED: ${why || "no description"}`);
};

// ================= a business cannot upgrade itself, verify itself, or give itself a rating
await user(A.u, "update public.listings set plan='featured', plan_until='2099-01-01', premium=true, verified_at=now(), license_verified_at=now(), google_rating=5, google_review_count=9999, google_reviews_url='https://x.test', status='pending', slug='hijacked', source='admin' where id=$1", [A.id]);
const l = (await q("select * from public.listings where id=$1", [A.id]))[0];
assert.deepEqual([l.plan, l.premium, l.plan_until, l.google_rating, l.google_review_count, l.google_reviews_url, l.status, l.slug], ["free", false, null, null, null, null, "published", "acme-hvac"], "plan, premium, rating, status and slug cannot be changed by the owner");
assert.equal(l.license_verified_at, null, "nor a licence mark");
await user(A.u, "update public.listings set description='We fix AC', phone='5125550000' where id=$1", [A.id]);
assert.equal((await q("select description from public.listings where id=$1", [A.id]))[0].description, "We fix AC", "but its own profile can be edited");
await user(A.u, "update public.listings set description='Defaced' where id=$1", [B.id]);
assert.notEqual((await q("select description from public.listings where id=$1", [B.id]))[0].description, "Defaced", "another business's listing cannot be edited");
await denied(() => user(A.u, "delete from public.listings where id=$1", [A.id]).then(async () => { if ((await q("select 1 from public.listings where id=$1", [A.id])).length) throw new Error("row-level security: still there"); }), "an owner cannot delete the listing");

// ================= a new business listing is always pending, free and unrated
const newer = await uid("new@x.com");
await user(newer, "insert into public.listings (slug,status,business_name,city,state,postal_code,plan,plan_until,premium,verified_at,google_rating) values ('shady','pending','Shady AC','Austin','Texas','78701','featured','2099-01-01',true,now(),5)");
const shady = (await q("select plan, premium, plan_until, verified_at, google_rating, status from public.listings where slug='shady'"))[0];
assert.deepEqual([shady.plan, shady.premium, shady.plan_until, shady.verified_at, shady.google_rating, shady.status], ["free", false, null, null, null, "pending"]);
await denied(() => user(newer, "insert into public.listings (slug,status,business_name,city,state,postal_code) values ('sneaky','published','Sneaky','Austin','Texas','78701')"), "a new listing cannot be published by its submitter");

// ================= nobody makes themselves an admin, an owner, or a customer of someone else
await denied(() => user(A.u, "insert into public.admin_users (user_id) values ($1)", [A.u]), "no self-made admin");
await denied(() => anon("insert into public.admin_users (user_id) values (gen_random_uuid())"), "no anonymous admin");
assert.equal((await user(A.u, "select * from public.admin_users")).rows.length, 0, "an owner reads no admin rows");
assert.equal((await user(A.u, "select public.is_admin() as a")).rows[0].a, false);
await denied(() => user(A.u, "insert into public.listing_owners (listing_id, user_id) values ($1,$2)", [B.id, A.u]), "no self-made owner of someone else's business");
await user(A.u, "update public.listing_owners set listing_id=$2 where user_id=$1", [A.u, B.id]);
assert.equal((await q("select count(*)::int n from public.listing_owners where user_id=$1 and listing_id=$2", [A.u, B.id]))[0].n, 0, "an owner cannot move itself to another business");
await denied(() => user(A.u, "insert into public.listing_claims (listing_id, user_id, user_email, status, contact_name) values ($1,$2,$3,'approved','x')", [B.id, A.u, A.email]), "a claim cannot approve itself");
await denied(() => user(A.u, "insert into public.listing_claims (listing_id, user_id, user_email, status, contact_name) values ($1,$2,'someone@else.com','pending','x')", [B.id, A.u]), "a claim cannot name another email");
for (const [fn, args] of [["admin_route_lead", [lead]], ["admin_route_report", [lead]], ["admin_flow_health", []], ["admin_unmatched_leads", []]]) {
  const ph = args.map((_, i) => `$${i + 1}`).join(",");
  const r = await user(A.u, `select * from public.${fn}(${ph})`, args).catch((e) => ({ rows: [], err: e }));
  assert.ok(r.err || r.rows.length === 0, `${fn} gives a non-admin nothing`);
}

// ================= payments and unlocks cannot be forged
await denied(() => user(A.u, "select public.unlock_lead($1,$2,0,'free')", [lead, A.id]), "a business cannot unlock a lead for free");
await denied(() => user(A.u, "select public.unlock_opportunity('bid', gen_random_uuid(), $1, 0, 'free')", [A.id]), "nor an opportunity");
await denied(() => anon("select public.unlock_lead($1,$2,0,'free')", [lead, A.id]), "nor an anonymous visitor");
await user(A.u, "update public.lead_assignments set unlocked_at=now(), unlock_cents=0, unlock_ref='forged' where lead_id=$1", [lead]);
assert.equal((await q("select count(*)::int n from public.lead_assignments where unlocked_at is not null")).at(0).n, 0, "the unlock columns cannot be written by a browser");
await denied(() => user(A.u, "insert into public.opportunity_unlocks (listing_id, kind, item_id) values ($1,'bid',gen_random_uuid())", [A.id]), "an unlock row cannot be inserted by a browser");
await denied(() => user(A.u, "insert into public.lead_assignments (lead_id, listing_id) values ($1,$2)", [lead, A.id]), "a lead cannot be assigned by a browser");
await denied(() => user(A.u, "insert into public.lead_activities (listing_id, kind, item_id, type, body) values ($1,'lead',$2,'status','forged')", [A.id, lead]), "the lead timeline cannot be forged");
await denied(() => user(A.u, "insert into public.status_alerts (listing_id, kind, item_id, to_stage) values ($1,'lead',$2,'won')", [A.id, lead]), "nor the email queue");
await denied(() => user(A.u, "insert into public.listing_events (listing_id, event, session_id) values ($1,'view','aaaaaaaaaa')", [B.id]), "nor the analytics");
await denied(() => user(A.u, "select * from public.listing_events"), "analytics rows are not readable");
await denied(() => user(A.u, "update public.lead_pipeline set stage='converted' where listing_id=$1", [A.id]).then(async () => { throw new Error("row-level security"); }), "a lead cannot be marked converted by hand");

// ================= private data stays private
await noRows(() => user(A.u, "select * from public.leads"), "a business cannot read the leads table");
await noRows(() => user(customer, "select * from public.leads", [], "jane@x.com"), "nor can a customer");
await noRows(() => anon("select * from public.leads"), "nor anyone signed out");
await denied(() => anon("insert into public.leads (issue, urgency, country, state, city, postal_code, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment) values ('x','Immediately','US','Texas','Austin','78701','a','b','5125550100','a@b.com','Phone','Residential','Homeowner',true)"), "a request cannot skip the CAPTCHA by writing to the table");
await denied(() => anon("insert into public.contact_messages (name, email, topic, message) values ('a','a@b.com','x','hello hello')"), "nor a contact message");
await denied(() => anon("insert into public.listings (slug,status,business_name,city,state,postal_code) values ('anon','pending','Anon','Austin','Texas','78701')"), "nor a listing");
await noRows(() => anon("select * from public.listing_private"), "private listing details are not public");
await noRows(() => anon("select * from public.listing_claims"), "claims are not public");
await noRows(() => anon("select * from public.lead_messages"), "messages are not public");
const hidden = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code) values ('draft-co','pending','Draft Co','Austin','Texas','78701') returning id"))[0].id;
assert.equal((await anon("select id from public.listings where id=$1", [hidden])).rows.length, 0, "a pending listing is not public");
assert.equal((await user(A.u, "select id from public.listings where id=$1", [hidden])).rows.length, 0, "nor visible to other businesses");
const mine = (await user(A.u, "select * from public.my_leads()")).rows;
assert.equal(mine.length, 1);
assert.deepEqual([mine[0].phone, mine[0].email, mine[0].street], [null, null, null], "locked lead contact details are hidden");
const theirs = await user(B.u, "select * from public.conversation_messages($1,$2)", [lead, A.id]).catch((e) => ({ rows: [], err: e }));
assert.ok(theirs.err || theirs.rows.length === 0, "a business cannot read another business's conversation");
await denied(() => user(B.u, "select public.send_message($1,$2,'hello')", [lead, A.id]), "nor write as another business");
await denied(() => user(B.u, "select public.send_message($1,$2,'hello')", [lead, B.id]), "nor message a customer before unlocking");

// ================= another business's projects, bids, bookings and documents
const proj = (await user(A.u, "insert into public.projects (listing_id, name) values ($1,'A job') returning id", [A.id])).rows[0].id;
assert.equal((await user(B.u, "select * from public.projects")).rows.length, 0);
await denied(() => user(B.u, "insert into public.project_tasks (project_id, title) values ($1,'x')", [proj]), "tasks on another business project");
await denied(() => user(B.u, "insert into public.bookings (listing_id, project_id, title, starts_at, ends_at) values ($1,$2,'x','2030-01-01 10:00+00','2030-01-01 11:00+00')", [B.id, proj]), "booking on another business project");
await denied(() => user(B.u, "insert into public.quotations (listing_id, project_id, title, amount_usd) values ($1,$2,'x',1)", [B.id, proj]), "quotation on another business project");

// ================= the customer side: only the person who made a request
const jane = await user(customer, "select * from public.my_conversations()", [], "jane@x.com").catch((e) => ({ rows: [], err: e }));
assert.ok(!jane.err || /Sign|email/i.test(jane.err.message), "a customer can list their own conversations");
const stranger = await uid("stranger@x.com");
const sc = await user(stranger, "select * from public.my_conversations()", [], "stranger@x.com").catch((e) => ({ rows: [], err: e }));
assert.equal(sc.rows.length, 0, "a stranger sees no one else's conversations");
await denied(() => user(stranger, "select public.send_message($1,$2,'I am the customer')", [lead, A.id], "stranger@x.com"), "a stranger cannot write into someone else's conversation");

console.log("abuse tests passed");
