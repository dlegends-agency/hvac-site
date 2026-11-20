// Automatic lead status (calls, emails, customer replies asking for a quote, proposals), the status email queue, and bookings.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/automation.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-permits.sql", "schema-bids.sql", "schema-opportunities.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-messages.sql", "schema-revamp.sql", "schema-myleads.sql", "schema-projects.sql", "schema-bidprep.sql", "schema-bookings.sql"]) {
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

const mkLead = async (listing, issue = "AC Not Cooling") => {
  const id = (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, status, source, description) values ($1,'Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100','jane@x.com','Phone','Residential','Homeowner',true,'new','homepage','x') returning id", [issue]))[0].id;
  await q("insert into public.lead_assignments (lead_id, listing_id, source) values ($1,$2,'auto') on conflict do nothing", [id, listing]);
  await q("select public.unlock_lead($1::uuid,$2::uuid,500,$3)", [id, listing, 'cs_' + id]);
  return id;
};
const stage = async (listing, kind, item) => (await q("select stage from public.lead_pipeline where listing_id=$1 and kind=$2 and item_id=$3", [listing, kind, item]))[0]?.stage;
const timeline = async (listing, item) => (await q("select body from public.lead_activities where listing_id=$1 and item_id=$2 order by id", [listing, item])).map((r) => r.body);

// ---- the detection words
const w = (await q("select public.asks_for_quote('Could you send me a quote for the unit?') a, public.asks_for_quote('How much would it cost?') b, public.asks_for_quote('Can you come Tuesday?') c, public.is_quote_subject('Proposal for your AC') d, public.is_quote_subject('Following up on your request') e"))[0];
assert.deepEqual([w.a, w.b, w.c, w.d, w.e], [true, true, false, true, false]);

// ---- a successful call -> Contacted (a missed call does not)
const l1 = await mkLead(A.id);
assert.equal(await stage(A.id, "lead", l1), undefined, "not in My Leads yet");
await run(A.user, "insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,'lead',$2,'AC Not Cooling')", [A.id, l1]);
assert.equal((await one(A.user, "select public.log_call('lead',$1,'no_answer',null) as r", [l1])).r, false);
assert.equal(await stage(A.id, "lead", l1), "saved", "no answer: the status stays");
assert.equal((await one(A.user, "select public.log_call('lead',$1,'connected','wants a visit') as r", [l1])).r, true);
assert.equal(await stage(A.id, "lead", l1), "contacted", "a successful call moves it to Contacted");
assert.ok((await timeline(A.id, l1)).some((b) => /Automatic: you had a successful call/.test(b)), "the timeline says why");
assert.equal((await q("select contractor_status s from public.lead_assignments where lead_id=$1 and listing_id=$2", [l1, A.id]))[0].s, "contacted", "the older status agrees");
await assert.rejects(() => run(B.user, "select public.log_call('lead',$1,'connected',null)", [l1]), /Lead not found/, "another business cannot");

// ---- the business emails (a message with a subject) -> Contacted, a proposal subject -> Quote sent, only forward
const l2 = await mkLead(A.id, "Furnace noise");
assert.equal(await stage(A.id, "lead", l2), undefined);
await run(A.user, "select public.send_message($1,$2,'Hi Jane, I can come by.','Your furnace request')", [l2, A.id]);
assert.equal(await stage(A.id, "lead", l2), "contacted", "an email moves a lead (even one not yet in My Leads) to Contacted");
await run(A.user, "select public.send_message($1,$2,'Scope and price below.','Proposal for your furnace')", [l2, A.id]);
assert.equal(await stage(A.id, "lead", l2), "quoted", "a proposal email moves it to Quote sent");
await run(A.user, "select public.send_message($1,$2,'Just checking in.','Following up')", [l2, A.id]);
assert.equal(await stage(A.id, "lead", l2), "quoted", "a later plain email never moves it back");

// ---- the customer asks for a quotation -> Interested; a plain reply does not
const l3 = await mkLead(A.id, "Duct cleaning");
await run(A.user, "select public.send_message($1,$2,'Hello!','Hi')", [l3, A.id]);
assert.equal(await stage(A.id, "lead", l3), "contacted");
await q("insert into public.lead_messages (lead_id, listing_id, sender, body) values ($1,$2,'customer','Thanks, can you come Tuesday?')", [l3, A.id]);
assert.equal(await stage(A.id, "lead", l3), "contacted", "a reply that asks nothing about price changes nothing");
await q("insert into public.lead_messages (lead_id, listing_id, sender, body) values ($1,$2,'customer','Could you send me a quotation for the whole house?')", [l3, A.id]);
assert.equal(await stage(A.id, "lead", l3), "interested", "a customer asking for a quotation moves it to Interested");
assert.ok((await timeline(A.id, l3)).some((b) => /Automatic: the customer asked for a quotation/.test(b)));

// ---- a permit contact: emails sent by the site, and replies the contractor logs
const permit = (await q("insert into public.public_permits (source, source_id, city, summary, description, address, people) values ('austin','p1','Austin','HVAC replace','x','5 Elm St','[{\"name\":\"Pat\",\"email\":\"pat@elm.com\"}]') returning id"))[0].id;
await q("insert into public.opportunity_unlocks (listing_id, kind, item_id, unlock_cents, unlock_ref) values ($1,'permit',$2,1000,'cs_p')", [A.id, permit]);
await q("select public.log_opportunity_email($1,'permit',$2,'pat@elm.com','Hello from Acme','Can we help?',null)", [A.id, permit]);
assert.equal(await stage(A.id, "permit", permit), "contacted", "an email the site sent for the business moves a permit lead to Contacted");
await q("select public.log_opportunity_email($1,'permit',$2,'pat@elm.com','Our proposal','Here it is','failed to send')", [A.id, permit]);
assert.equal(await stage(A.id, "permit", permit), "contacted", "an email that failed to send changes nothing");
assert.equal((await one(A.user, "select public.log_inbound_reply('permit',$1,'Thanks. Please send your price for the rooftop units.') as r", [permit])).r, true);
assert.equal(await stage(A.id, "permit", permit), "interested", "a logged reply asking for a price moves it to Interested");
await q("select public.log_opportunity_email($1,'permit',$2,'pat@elm.com','Quotation: rooftop units','Attached',null)", [A.id, permit]);
assert.equal(await stage(A.id, "permit", permit), "quoted");

// ---- a bid: the site email, then the workspace marked Submitted
const bid = (await q("insert into public.gov_bids (notice_id, title, notice_type, city, state, response_due, description, summary) values ('n1','Replace chillers','Solicitation','Fort Hood','TX', now() + interval '20 days','x','y') returning id"))[0].id;
await q("insert into public.opportunity_unlocks (listing_id, kind, item_id, unlock_cents, unlock_ref) values ($1,'bid',$2,1500,'cs_b')", [A.id, bid]);
const ws = (await one(A.user, "select public.start_bid_workspace($1) as id", [bid])).id;
await q("select public.log_opportunity_email($1,'bid',$2,'co@army.mil','Interest in the solicitation','Hello',null)", [A.id, bid]);
assert.equal(await stage(A.id, "bid", bid), "contacted");
await q("alter table public.bid_workspaces disable trigger bid_workspaces_guard"); // the approval rules are tested in bidprep.test.mjs
await q("update public.bid_workspaces set status='submitted' where id=$1", [ws]);
assert.equal(await stage(A.id, "bid", bid), "submitted", "a submitted bid workspace moves the bid to Bid submitted");

// ---- never moves out of Accepted, Converted or Lost
const l4 = await mkLead(A.id, "Thermostat");
await run(A.user, "insert into public.lead_pipeline (listing_id, kind, item_id, title) values ($1,'lead',$2,'Thermostat')", [A.id, l4]);
await run(A.user, "update public.lead_pipeline set stage='won' where item_id=$1", [l4]);
await run(A.user, "select public.send_message($1,$2,'Booked!','Proposal accepted')", [l4, A.id]);
assert.equal(await stage(A.id, "lead", l4), "won", "an accepted lead is never moved by an email");
await run(A.user, "update public.lead_pipeline set stage='lost' where item_id=$1", [l1]);
await q("insert into public.lead_messages (lead_id, listing_id, sender, body) values ($1,$2,'customer','What is the price?')", [l1, A.id]);
assert.equal(await stage(A.id, "lead", l1), "lost", "nor a lost one");
assert.equal(await stage(B.id, "lead", l1), undefined, "another business's board is untouched");

// ---- every status change queues one email to the owner
const alerts = await q("select to_stage, reason from public.status_alerts where listing_id=$1 and item_id=$2 order by created_at, id", [A.id, l3]);
assert.deepEqual(alerts.map((a) => a.to_stage), ["saved", "contacted", "interested"].slice(1), "one alert per change, including automatic ones");
assert.equal(alerts[1].reason, "the customer asked for a quotation");
assert.equal(await count("select count(*)::int n from public.status_alerts where listing_id=$1 and item_id=$2 and to_stage='won'", [A.id, l4]), 1, "a change by the contractor is queued too");
const claimed = (await db.query("select * from public.claim_status_alerts(100)")).rows;
assert.ok(claimed.length > 5 && claimed.every((c) => c.email && c.to_label), "alerts are claimed with the owner's address and readable labels");
assert.equal((await db.query("select * from public.claim_status_alerts(100)")).rows.length, 0, "claimed alerts are not handed out twice");
await db.query("select public.finish_status_alerts($1::uuid[], '{}'::jsonb)", [claimed.map((c) => c.id)]);
await assert.rejects(() => run(A.user, "select * from public.claim_status_alerts(5)"), /permission denied/, "a contractor cannot read the queue");
await assert.rejects(() => run(A.user, "select public.auto_advance($1,'lead',$2,'quoted','x')", [A.id, l4]), /permission denied/, "nor move a lead through the automatic route");

// ---- bookings
const bk = (await run(A.user, "insert into public.bookings (listing_id, lead_kind, lead_item_id, type, title, starts_at, ends_at, customer_name) values ($1,'lead',$2,'site_visit','Site visit: Thermostat','2030-03-04 15:00+00','2030-03-04 16:00+00','Jane Doe') returning id", [A.id, l4])).rows[0].id;
assert.ok((await timeline(A.id, l4)).includes("Booking scheduled: Site visit: Thermostat"), "a booking is on the lead's timeline");
await assert.rejects(() => run(A.user, "insert into public.bookings (listing_id, title, starts_at, ends_at) values ($1,'x','2030-03-04 16:00+00','2030-03-04 15:00+00')", [A.id]), /check/, "it must end after it starts");
await assert.rejects(() => run(B.user, "insert into public.bookings (listing_id, title, starts_at, ends_at) values ($1,'Forged','2030-03-04 15:00+00','2030-03-04 16:00+00')", [A.id]), /row-level security/, "nobody books on another business's calendar");
await assert.rejects(() => run(B.user, "insert into public.bookings (listing_id, lead_kind, lead_item_id, title, starts_at, ends_at) values ($1,'lead',$2,'x','2030-03-04 15:00+00','2030-03-04 16:00+00')", [B.id, l4]), /row-level security/, "nor tie one to a lead that is not theirs");
assert.equal((await run(B.user, "select * from public.bookings")).rows.length, 0, "calendars are private");
await run(A.user, "update public.bookings set status='cancelled' where id=$1", [bk]);
assert.ok((await timeline(A.id, l4)).includes("Booking cancelled: Site visit: Thermostat"));
await assert.rejects(() => run(A.user, "update public.bookings set listing_id=$2 where id=$1", [bk, B.id]), /permission denied/, "a booking cannot be moved to another business");

// ---- a booking tied to a project shows on the project timeline
const proj = (await one(A.user, "select public.convert_lead_to_project('lead',$1,'Residential HVAC','Thermostat',300,'ok') as id", [l4])).id;
await run(A.user, "insert into public.bookings (listing_id, project_id, title, type, starts_at, ends_at) values ($1,$2,'Install thermostat','installation','2030-03-06 14:00+00','2030-03-06 15:00+00')", [A.id, proj]);
assert.ok((await run(A.user, "select body from public.project_activities where project_id=$1", [proj])).rows.some((r) => /Booking scheduled: Install thermostat/.test(r.body)));
await assert.rejects(() => run(B.user, "insert into public.bookings (listing_id, project_id, title, starts_at, ends_at) values ($1,$2,'x','2030-03-06 14:00+00','2030-03-06 15:00+00')", [B.id, proj]), /row-level security/, "nor to another business's project");

console.log("automation tests passed");
