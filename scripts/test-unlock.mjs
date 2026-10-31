// Offline tests for pay-per-lead unlocking and the Stripe webhook. Run: npm run test:unlock
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { onRequestPost as unlock } from "../functions/api/stripe/unlock.ts";
import { onRequestPost as checkout } from "../functions/api/stripe/checkout.ts";
import { onRequestPost as webhook } from "../functions/api/stripe/webhook.ts";
import { LEAD_PRICE_CENTS } from "../functions/_lib/stripe.ts";

// The prices shown on the website and the prices charged by the server must be the same.
const shown = readFileSync(new URL("../src/config/pricing.ts", import.meta.url), "utf8").match(/leadPrice = \{ free: (\d+), paid: (\d+) \}/);
assert.ok(shown, "src/config/pricing.ts defines leadPrice");
assert.deepEqual({ free: Number(shown[1]) * 100, paid: Number(shown[2]) * 100 }, LEAD_PRICE_CENTS, "the website and the server charge the same lead prices");
assert.deepEqual(LEAD_PRICE_CENTS, { free: 1000, paid: 500 });

const env = {
  STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_t", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "pub", STRIPE_PRICE_FEATURED: "price_m", STRIPE_PRICE_FEATURED_YEARLY: "price_y", VITE_SITE_URL: "https://site.test",
};
const LEAD = "11111111-1111-4111-8111-111111111111";
const LISTING = "22222222-2222-4222-8222-222222222222";
const future = new Date(Date.now() + 20 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

let state, log, stripeReply;
const reset = () => {
  state = { owner: [{ listing_id: LISTING }], assignment: [{ unlocked_at: null }], listing: [{ plan: "free", plan_until: null }], lead: [{ issue: "AC Not Cooling, Thermostat Problem" }], billing: [], dbFail: false };
  log = []; stripeReply = (path) => ({ url: `https://checkout.test${path}` });
};
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const method = init.method ?? "GET"; log.push({ url, method, body: init.body });
  if (url.endsWith("/auth/v1/user")) return init.headers.Authorization === "Bearer tok" ? new Response(JSON.stringify({ id: "u1", email: "o@a.com" })) : new Response("{}", { status: 401 });
  if (url.includes("/rest/v1/listing_owners")) return new Response(JSON.stringify(state.owner));
  if (url.includes("/rest/v1/lead_assignments")) return new Response(JSON.stringify(state.assignment));
  if (url.includes("/rest/v1/listings") && method === "GET") return new Response(JSON.stringify(state.listing));
  if (url.includes("/rest/v1/leads")) return new Response(JSON.stringify(state.lead));
  if (url.includes("/rest/v1/listing_billing") && method === "GET") return new Response(JSON.stringify(state.billing));
  if (url.includes("/rest/v1/")) return state.dbFail ? new Response("{}", { status: 500 }) : new Response(null, { status: 204 }); // writes
  if (url.endsWith("/rpc/unlock_lead")) return state.dbFail ? new Response("{}", { status: 500 }) : new Response("true");
  if (url.startsWith("https://api.stripe.com/v1/subscriptions/")) return new Response(JSON.stringify({ id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ price: { id: "price_y" }, current_period_end: 1_900_000_000 }] } }));
  if (url.startsWith("https://api.stripe.com/v1/checkout/sessions")) { const r = stripeReply(url); return r instanceof Response ? r : new Response(JSON.stringify(r)); }
  throw new Error("unexpected " + url);
};
const req = (body = {}, token = "tok") => new Request("https://site.test/x", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const form = (call) => Object.fromEntries(new URLSearchParams(call.body));
const stripeCall = () => log.find((l) => l.url.startsWith("https://api.stripe.com/v1/checkout/sessions"));

// ------------------------------------------------------------ starting a lead payment
reset();
assert.equal((await unlock({ env, request: req({ leadId: LEAD }, "") })).status, 401, "not signed in");
assert.equal((await unlock({ env, request: req({ leadId: "not-a-uuid" }) })).status, 400);
assert.equal((await unlock({ env: { ...env, STRIPE_SECRET_KEY: undefined }, request: req({ leadId: LEAD }) })).status, 501);
state.owner = [];
assert.equal((await unlock({ env, request: req({ leadId: LEAD }) })).status, 403, "no approved listing");
reset(); state.assignment = [];
assert.equal((await unlock({ env, request: req({ leadId: LEAD }) })).status, 404, "a lead that was not sent to this contractor");
reset(); state.assignment = [{ unlocked_at: new Date().toISOString() }];
assert.equal((await unlock({ env, request: req({ leadId: LEAD }) })).status, 409, "no paying twice");
assert.equal(stripeCall(), undefined, "nothing is charged for an unlocked lead");

// $10 on the free plan.
reset();
let res = await unlock({ env, request: req({ leadId: LEAD, cents: 1, price: 1 }) }); // the browser cannot choose the price
assert.equal(res.status, 200);
assert.equal((await res.json()).cents, 1000);
let f = form(stripeCall());
assert.equal(f["line_items[0][price_data][unit_amount]"], "1000");
assert.equal(f.mode, "payment");
assert.equal(f["line_items[0][price_data][currency]"], "usd");
assert.equal(f["line_items[0][price_data][product_data][name]"], "Customer request: AC Not Cooling, Thermostat Problem");
assert.deepEqual([f["metadata[kind]"], f["metadata[lead_id]"], f["metadata[listing_id]"]], ["lead_unlock", LEAD, LISTING]);
assert.deepEqual([f["payment_intent_data[metadata][kind]"], f["payment_intent_data[metadata][lead_id]"]], ["lead_unlock", LEAD], "metadata also on the payment itself");
assert.equal(f["invoice_creation[enabled]"], "true", "a receipt is created for payment history");
assert.deepEqual([f.customer_creation, f.customer_email, f.customer], ["always", "o@a.com", undefined], "new customer is created and remembered");
assert.equal(f.success_url, `https://site.test/contractor/leads?unlocked=1&lead=${LEAD}`, "returns to the page and names the request, so it can show it unlocking");

// $5 on the paid plan (monthly or yearly), but only while it is active.
reset(); state.listing = [{ plan: "featured", plan_until: future }];
assert.equal((await (await unlock({ env, request: req({ leadId: LEAD }) })).json()).cents, 500);
assert.equal(form(stripeCall())["line_items[0][price_data][unit_amount]"], "500");
reset(); state.listing = [{ plan: "featured", plan_until: null }];
assert.equal((await (await unlock({ env, request: req({ leadId: LEAD }) })).json()).cents, 500, "no end date means active");
reset(); state.listing = [{ plan: "featured", plan_until: past }];
assert.equal((await (await unlock({ env, request: req({ leadId: LEAD }) })).json()).cents, 1000, "a lapsed plan pays the free-plan price");

// An existing Stripe customer is reused.
reset(); state.billing = [{ stripe_customer_id: "cus_9", stripe_subscription_id: null, status: null }];
await unlock({ env, request: req({ leadId: LEAD }) });
f = form(stripeCall());
assert.deepEqual([f.customer, f.customer_creation, f.customer_email], ["cus_9", undefined, undefined]);
reset(); stripeReply = () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 });
assert.equal((await unlock({ env, request: req({ leadId: LEAD }) })).status, 502, "Stripe failure reported");

// ------------------------------------------------------------ plan checkout: monthly and yearly
reset(); state.listing = [];
assert.equal((await checkout({ env, request: req({ interval: "year" }) })).status, 200);
f = form(stripeCall());
assert.deepEqual([f["line_items[0][price]"], f.mode, f["metadata[plan]"]], ["price_y", "subscription", "featured"], "yearly price");
reset(); await checkout({ env, request: req({}) });
assert.equal(form(stripeCall())["line_items[0][price]"], "price_m", "monthly by default");
reset();
assert.equal((await checkout({ env, request: req({ plan: "premium" }) })).status, 400, "the Premium plan no longer exists");
assert.equal((await checkout({ env, request: req({ interval: "weekly" }) })).status, 400);
reset(); state.billing = [{ stripe_customer_id: "cus_1", status: "active" }];
assert.equal((await checkout({ env, request: req({}) })).status, 409, "already subscribed");
assert.equal((await checkout({ env: { ...env, STRIPE_PRICE_FEATURED_YEARLY: undefined }, request: req({ interval: "year" }) })).status, 501, "yearly price not set up yet");

// ------------------------------------------------------------ the webhook
const send = (event, secret = env.STRIPE_WEBHOOK_SECRET, e = env) => {
  const payload = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
  return webhook({ env: e, request: new Request("https://site.test/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": sig }, body: payload }) });
};
const session = (over = {}) => ({ id: "cs_1", mode: "payment", payment_status: "paid", customer: "cus_1", amount_total: 500, metadata: { kind: "lead_unlock", lead_id: LEAD, listing_id: LISTING }, ...over });
const ev = (object, type = "checkout.session.completed") => ({ type, data: { object } });
const writes = () => log.filter((l) => l.url.includes("/rest/v1/") && l.method !== "GET" || l.url.endsWith("/rpc/unlock_lead"));

reset();
assert.equal((await send(ev(session()), "wrong")).status, 400, "forged event rejected");
assert.equal(writes().length, 0);

reset();
assert.equal((await send(ev(session()))).status, 200);
const rpc = log.find((l) => l.url.endsWith("/rpc/unlock_lead"));
assert.deepEqual(JSON.parse(rpc.body), { p_lead: LEAD, p_listing: LISTING, p_cents: 500, p_ref: "cs_1" }, "the lead is unlocked for the contractor who paid, recording what was paid");
const keep = log.find((l) => l.url.includes("listing_billing") && l.method === "POST");
assert.deepEqual(JSON.parse(keep.body), { listing_id: LISTING, stripe_customer_id: "cus_1" }, "only the customer id is saved, so an existing subscription record is untouched");

for (const [name, over] of [["unpaid", { payment_status: "unpaid" }], ["not a lead payment", { metadata: { kind: "other" } }], ["no lead", { metadata: { kind: "lead_unlock", listing_id: LISTING } }]]) {
  reset(); assert.equal((await send(ev(session(over)))).status, 200);
  assert.equal(log.some((l) => l.url.endsWith("/rpc/unlock_lead")), false, `${name}: nothing unlocked`);
}
reset(); await send(ev(session({ payment_status: "paid" }), "checkout.session.async_payment_succeeded"));
assert.ok(log.some((l) => l.url.endsWith("/rpc/unlock_lead")), "delayed payment methods unlock when the payment lands");
reset(); state.dbFail = true;
assert.equal((await send(ev(session()))).status, 500, "a database failure makes Stripe retry");

// A yearly subscription: plan switched on until the end of the paid year, interval recorded.
reset();
assert.equal((await send(ev({ id: "cs_2", mode: "subscription", subscription: "sub_1", client_reference_id: LISTING }))).status, 200);
const billing = JSON.parse(log.find((l) => l.url.includes("listing_billing") && l.method === "POST").body);
assert.deepEqual([billing.plan, billing.billing_interval, billing.status, billing.current_period_end], ["featured", "year", "active", new Date(1_900_000_000 * 1000).toISOString()]);
const patch = JSON.parse(log.find((l) => l.url.includes("/rest/v1/listings") && l.method === "PATCH").body);
assert.deepEqual(patch, { plan: "featured", plan_until: new Date(1_900_000_000 * 1000).toISOString() });

console.log("unlock + webhook: all checks passed");
