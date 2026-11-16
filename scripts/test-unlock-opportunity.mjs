// Offline tests for paying to unlock the phone and email on a building permit or government bid. Run: npm run test:opportunity
import assert from "node:assert/strict";
import { onRequestPost as unlock } from "../functions/api/stripe/unlock-opportunity.ts";
import { onRequestPost as confirm } from "../functions/api/stripe/confirm.ts";

const env = { STRIPE_SECRET_KEY: "sk_test", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub", VITE_SITE_URL: "https://site.test" };
const ITEM = "33333333-3333-4333-8333-333333333333";
const LISTING = "22222222-2222-4222-8222-222222222222";
const future = new Date(Date.now() + 20 * 864e5).toISOString();

let state, log;
const reset = () => {
  state = { owner: [{ listing_id: LISTING }], reaches: true, unlocked: [], listing: [{ plan: "free", plan_until: null }], item: [{ summary: "Residential HVAC: replace furnace" }], billing: [], paid: true };
  log = [];
};
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const method = init.method ?? "GET"; log.push({ url, method, body: init.body });
  if (url.endsWith("/auth/v1/user")) return init.headers.Authorization === "Bearer tok" ? new Response(JSON.stringify({ id: "u1", email: "o@a.com" })) : new Response("{}", { status: 401 });
  if (url.includes("/rest/v1/listing_owners")) return new Response(JSON.stringify(state.owner));
  if (url.endsWith("/rpc/opportunity_reaches")) return new Response(JSON.stringify(state.reaches));
  if (url.endsWith("/rpc/unlock_opportunity")) return new Response("true");
  if (url.includes("/rest/v1/opportunity_unlocks")) return new Response(JSON.stringify(state.unlocked));
  if (url.includes("/rest/v1/listing_billing") && method === "GET") return new Response(JSON.stringify(state.billing));
  if (url.includes("/rest/v1/listing_billing")) return new Response(null, { status: 204 });
  if (url.includes("/rest/v1/listings")) return new Response(JSON.stringify(state.listing));
  if (url.includes("/rest/v1/public_permits") || url.includes("/rest/v1/gov_bids")) return new Response(JSON.stringify(state.item));
  if (url === "https://api.stripe.com/v1/checkout/sessions") return new Response(JSON.stringify({ url: "https://checkout.test/pay" }));
  if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    return new Response(JSON.stringify({ id: "cs_test_abc", mode: "payment", payment_status: state.paid ? "paid" : "unpaid", customer: "cus_1", amount_total: 1000, metadata: { kind: "permit_unlock", item_id: ITEM, listing_id: LISTING } }));
  }
  throw new Error("unexpected " + url);
};
const req = (body = {}, token = "tok") => new Request("https://site.test/x", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const form = () => Object.fromEntries(new URLSearchParams(log.find((l) => l.url === "https://api.stripe.com/v1/checkout/sessions").body));

reset();
assert.equal((await unlock({ env, request: req({ kind: "permit", itemId: ITEM }, "") })).status, 401, "not signed in");
assert.equal((await unlock({ env, request: req({ kind: "other", itemId: ITEM }) })).status, 400);
assert.equal((await unlock({ env, request: req({ kind: "permit", itemId: "nope" }) })).status, 400);
assert.equal((await unlock({ env: { ...env, STRIPE_SECRET_KEY: undefined }, request: req({ kind: "permit", itemId: ITEM }) })).status, 501);
state.reaches = false;
assert.equal((await unlock({ env, request: req({ kind: "permit", itemId: ITEM }) })).status, 404, "a lead outside this business's area cannot be bought");
reset(); state.unlocked = [{ item_id: ITEM }];
assert.equal((await unlock({ env, request: req({ kind: "bid", itemId: ITEM }) })).status, 409, "no paying twice");
assert.equal(log.some((l) => l.url === "https://api.stripe.com/v1/checkout/sessions"), false, "nothing is charged twice");

reset();
let res = await unlock({ env, request: req({ kind: "permit", itemId: ITEM, cents: 1 }) }); // the browser cannot choose the price
assert.equal(res.status, 200);
assert.deepEqual(await res.json(), { url: "https://checkout.test/pay", cents: 1000 });
let f = form();
assert.equal(f["line_items[0][price_data][unit_amount]"], "1000");
assert.equal(f["line_items[0][price_data][product_data][name]"], "Building permit: Residential HVAC: replace furnace");
assert.deepEqual([f["metadata[kind]"], f["metadata[item_id]"], f["metadata[listing_id]"]], ["permit_unlock", ITEM, LISTING]);
assert.equal(f.success_url, `https://site.test/contractor/opportunities?unlocked=1&session_id={CHECKOUT_SESSION_ID}&open=${ITEM}&tab=permits`);

reset(); state.listing = [{ plan: "featured", plan_until: future }]; state.item = [{ title: "Replace chiller" }];
res = await unlock({ env, request: req({ kind: "bid", itemId: ITEM }) });
assert.equal((await res.json()).cents, 500, "the paid plan pays $5");
f = form();
assert.equal(f["line_items[0][price_data][product_data][name]"], "Government bid: Replace chiller");
assert.equal(f["metadata[kind]"], "bid_unlock");
assert.ok(!f.success_url.includes("tab=permits"), "bids are the first tab");

// Coming back from Stripe: the server asks Stripe, then unlocks through the database function.
reset();
res = await confirm({ env, request: req({ sessionId: "cs_test_abc" }) });
assert.deepEqual(await res.json(), { paid: true });
const call = log.find((l) => l.url.endsWith("/rpc/unlock_opportunity"));
assert.deepEqual(JSON.parse(call.body), { p_kind: "permit", p_item: ITEM, p_listing: LISTING, p_cents: 1000, p_ref: "cs_test_abc" });
reset(); state.paid = false;
await confirm({ env, request: req({ sessionId: "cs_test_abc" }) });
assert.equal(log.some((l) => l.url.endsWith("/rpc/unlock_opportunity")), false, "an unpaid session unlocks nothing");

console.log("opportunity unlock: all checks passed");
