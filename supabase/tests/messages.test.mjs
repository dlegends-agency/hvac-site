// Loads the real schema files in order into in-memory Postgres (PGlite) with stubs for Supabase auth, then checks messages between
// customers and businesses and the customer's request log.
// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/messages.test.mjs
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
for (const f of ["schema.sql", "schema-blog-analytics.sql", "schema-contact.sql", "schema-directory.sql", "schema-discovery.sql", "schema-contractors.sql", "schema-profiles.sql", "schema-customers.sql", "schema-flow.sql", "schema-messages.sql"]) {
  try { await db.exec(read(f)); } catch (e) { throw new Error(`${f}: ${e.message}`); }
}
await db.exec(read("schema-messages.sql")); // safe to run twice
await db.exec("grant usage on schema auth, public to authenticated; grant select on public.listing_owners, public.listings to authenticated; grant execute on function public.is_admin() to authenticated");

const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (user, fn) => {
  await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false)"); }
};
const rows = (user, sql, p) => as(user, () => db.query(sql, p)).then((r) => r.rows);
const uid = async (email, confirmed = true) => (await q(`insert into auth.users (email, email_confirmed_at) values ($1, ${confirmed ? "now()" : "null"}) returning id`, [email]))[0].id;
const admin = await uid("admin@x.com");
await q("insert into public.admin_users (user_id) values ($1)", [admin]);

const mkListing = async (name, plan) => {
  const id = (await q("insert into public.listings (slug,status,business_name,city,state,postal_code) values ($1,'published',$2,'Austin','Texas','78701') returning id", [name.toLowerCase().replace(/\W+/g, "-"), name]))[0].id;
  if (plan === "featured") await q("update public.listings set plan='featured' where id=$1", [id]);
  const user = await uid(`${name}@x.com`);
  await q("insert into public.listing_owners (listing_id,user_id) values ($1,$2)", [id, user]);
  return { id, user };
};
const A = await mkListing("Acme HVAC", "featured"); // paid
const B = await mkListing("Bravo Air", "featured"); // paid
const C = await mkListing("Cheap Cool", "free"); // free
const customer = await uid("jane@x.com");
const stranger = await uid("stranger@x.com");
const lead = async (email = "jane@x.com", customerId = null) =>
  (await q("insert into public.leads (issue, urgency, country, state, city, postal_code, street, first_name, last_name, phone, email, contact_method, property_type, property_status, referral_acknowledgment, customer_id) values ('AC Not Cooling','Immediately','US','Texas','Austin','78701','1 Main St','Jane','Doe','5125550100',$1,'Phone','Residential','Homeowner',true,$2) returning id", [email, customerId]))[0].id;
const L = await lead("jane@x.com", customer);
assert.equal((await q("select count(*)::int n from public.lead_assignments where lead_id=$1", [L]))[0].n, 3, "the request went to all three");

// ---------------------------------------------------------------- sending
const send = (user, l, listing, text) => as(user, () => db.query("select public.send_message($1,$2,$3) as id", [l, listing, text]));
await send(A.user, L, A.id, "Hi Jane, I can come tomorrow morning. What time suits you?");
await send(customer, L, A.id, "9am would be great, thank you.");
await send(customer, L, B.id, "Do you work on heat pumps?");

await assert.rejects(() => send(C.user, L, C.id, "hello"), /Featured/, "a free business cannot send");
await assert.rejects(() => send(customer, L, C.id, "hello"), /Featured/, "nor receive new messages");
await assert.rejects(() => send(stranger, L, A.id, "hi"), /Not allowed/, "someone else's request");
await assert.rejects(() => send(A.user, L, B.id, "hi"), /Not allowed/, "a business cannot write as another business");
const otherLead = await lead("other@x.com");
await assert.rejects(() => send(customer, otherLead, A.id, "hi"), /Not allowed/, "a customer cannot write about a request that is not theirs");
await assert.rejects(() => send(A.user, L, A.id, "   "), /1 to 2000/, "no empty messages");
await assert.rejects(() => send(A.user, L, A.id, "x".repeat(2001)), /1 to 2000/);
await assert.rejects(() => as(null, () => db.query("select public.send_message($1,$2,'hi')", [L, A.id])), /Sign in/, "signed out");
await assert.rejects(() => db.query("set role anon").then(() => db.query("select public.send_message($1,$2,'hi')", [L, A.id])).finally(() => db.exec("reset role")), /permission denied/, "anon has no access");

// A request the business did not receive.
const farLead = await lead("jane@x.com", customer);
await q("delete from public.lead_assignments where lead_id=$1 and listing_id=$2", [farLead, A.id]);
await assert.rejects(() => send(A.user, farLead, A.id, "hi"), /did not receive/);

// A business that lets its plan lapse can no longer send.
await q("update public.listings set plan_until = now() - interval '1 day' where id=$1", [B.id]);
await assert.rejects(() => send(B.user, L, B.id, "hi"), /Featured/, "an expired plan is a free plan");
await q("update public.listings set plan_until = null where id=$1", [B.id]);

// Limit: 20 per hour per side of a conversation.
for (let i = 0; i < 19; i++) await send(customer, L, A.id, `message ${i}`);
await assert.rejects(() => send(customer, L, A.id, "one too many"), /Too many/);
await send(A.user, L, A.id, "the business has its own allowance");

// ---------------------------------------------------------------- reading
const thread = await rows(customer, "select * from public.conversation_messages($1,$2)", [L, A.id]);
assert.equal(thread[0].body.startsWith("Hi Jane"), true);
assert.equal(thread[0].mine, false, "the customer did not write the first message");
assert.equal(thread[1].mine, true);
assert.deepEqual(await rows(stranger, "select * from public.conversation_messages($1,$2)", [L, A.id]), [], "a stranger reads nothing");
assert.deepEqual(await rows(B.user, "select * from public.conversation_messages($1,$2)", [L, A.id]), [], "nor another business");
assert.deepEqual(await rows(A.user, "select * from public.conversation_messages($1,$2)", [L, B.id]), [], "nor a business a thread that is not its own");
assert.equal((await rows(customer, "select count(*)::int n from public.lead_messages"))[0].n, 0, "a customer cannot read the table");
assert.ok((await rows(admin, "select count(*)::int n from public.lead_messages"))[0].n > 10, "an admin can");

// read marks
let unread = (await rows(A.user, "select public.my_unread_messages() as u"))[0].u;
assert.ok(unread.as_business >= 18 && unread.as_customer === 0);
await rows(A.user, "select * from public.conversation_messages($1,$2)", [L, A.id]);
unread = (await rows(A.user, "select public.my_unread_messages() as u"))[0].u;
assert.equal(unread.as_business, 0, "opening the conversation marks it read");
await send(A.user, L, A.id, "See you then.");
unread = (await rows(customer, "select public.my_unread_messages() as u"))[0].u;
assert.equal(unread.as_customer, 1, "the customer has not opened the business's newest message");
assert.equal((await rows(customer, "select public.my_unread_messages() as u"))[0].u.as_business, 0);

// ---------------------------------------------------------------- lists
const mine = await rows(customer, "select * from public.my_conversations()");
const names = mine.map((r) => `${r.business_name}:${r.lead_id === L ? "L" : "far"}`).sort();
assert.ok(names.includes("Acme HVAC:L") && names.includes("Bravo Air:L"), "paid businesses that got the request");
assert.ok(!names.includes("Cheap Cool:L"), "a free business with no messages is not offered");
assert.equal(mine.find((r) => r.business_name === "Acme HVAC" && r.lead_id === L).unread, 1);
assert.equal((await rows(stranger, "select * from public.my_conversations()")).length, 0);

const theirs = await rows(A.user, "select * from public.business_conversations()");
assert.deepEqual(theirs.map((r) => [r.lead_id, r.customer]), [[L, "Customer"]], "only conversations with messages; the name is hidden while locked");
await q("update public.lead_assignments set unlocked_at = now() where lead_id=$1 and listing_id=$2", [L, A.id]);
assert.equal((await rows(A.user, "select * from public.business_conversations()"))[0].customer, "Jane", "the first name shows once unlocked");
const started = await rows(C.user, "select * from public.business_conversations($1)", [L]);
assert.equal(started.length, 1, "naming a request offers to start a conversation on it");
assert.equal(started[0].can_send, false, "a free business can see it but not send");
assert.equal((await rows(A.user, "select * from public.business_conversations($1)", [farLead])).filter((r) => r.lead_id === farLead).length, 0, "a request the business did not receive cannot be started");
assert.equal((await rows(stranger, "select * from public.business_conversations($1)", [L])).length, 0, "someone with no business sees nothing");
assert.ok(JSON.stringify(theirs).indexOf("5125550100") < 0 && JSON.stringify(theirs).indexOf("jane@x.com") < 0, "no contact details in messages or lists");

// ---------------------------------------------------------------- a customer who asked before signing up
const early = await lead("late@x.com");
const lateUnconfirmed = await uid("late@x.com", false);
await q("update public.lead_assignments set unlocked_at = unlocked_at where lead_id=$1", [early]);
await assert.rejects(() => send(lateUnconfirmed, early, A.id, "hi"), /Not allowed/, "an unconfirmed email does not claim earlier requests");
await q("update auth.users set email_confirmed_at = now() where id=$1", [lateUnconfirmed]);
await send(lateUnconfirmed, early, A.id, "hi, now confirmed");

// ---------------------------------------------------------------- the customer's request log
await q("update public.lead_assignments set contractor_status='contacted', contacted_at=now() where lead_id=$1 and listing_id=$2", [L, A.id]);
await q("update public.leads set status='closed' where id=$1", [L]);
const log = await rows(customer, "select * from public.my_request_log($1)", [L]);
const kinds = log.map((e) => e.kind);
assert.equal(kinds[0], "received");
assert.equal(kinds.filter((k) => k === "sent").length, 3);
assert.ok(kinds.includes("contacted") && kinds.includes("closed") && kinds.includes("message_in") && kinds.includes("message_out"));
assert.ok(!JSON.stringify(log).includes("alert") && !JSON.stringify(log).includes("pi_"), "no internal steps or money");
assert.deepEqual(await rows(stranger, "select * from public.my_request_log($1)", [L]), [], "only the customer's own request");
assert.deepEqual(await rows(A.user, "select * from public.my_request_log($1)", [L]), [], "a business does not read the customer's log");
await q("update public.leads set status='spam' where id=$1", [early]);
assert.deepEqual(await rows(lateUnconfirmed, "select * from public.my_request_log($1)", [early]), [], "spam is hidden");

// deleting a request deletes its messages
await q("delete from public.leads where id=$1", [L]);
assert.equal((await q("select count(*)::int n from public.lead_messages where lead_id=$1", [L]))[0].n, 0);

console.log("messages SQL: all checks passed");
