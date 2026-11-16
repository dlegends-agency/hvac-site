// Offline tests for saved cards (list, add, default, remove) and one-click payment with the default card. Run: npm run test:cards
import assert from "node:assert/strict";
import { onRequestPost as cards } from "../functions/api/stripe/cards.ts";
import { onRequestPost as unlock } from "../functions/api/stripe/unlock.ts";
import { onRequestPost as unlockOpp } from "../functions/api/stripe/unlock-opportunity.ts";

const env = { STRIPE_SECRET_KEY: "sk_test", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub", VITE_SITE_URL: "https://site.test" };
const LISTING = "22222222-2222-4222-8222-222222222222";
const LEAD = "11111111-1111-4111-8111-111111111111";
const ITEM = "33333333-3333-4333-8333-333333333333";

let state, log;
const reset = () => {
  state = {
    billing: [{ stripe_customer_id: "cus_1", stripe_subscription_id: null, status: null }],
    pms: [{ id: "pm_a", customer: "cus_1", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }, { id: "pm_b", customer: "cus_1", card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2031 } }],
    other: { id: "pm_other", customer: "cus_other", card: { brand: "visa", last4: "1111", exp_month: 1, exp_year: 2030 } },
    defaultPm: "pm_a",
    payFails: false,
    assignment: [{ unlocked_at: null }],
  };
  log = [];
};
const stripeCalls = (path) => log.filter((l) => l.url.includes("api.stripe.com") && l.url.includes(path));
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const method = init.method ?? "GET"; log.push({ url, method, body: init.body });
  const form = () => Object.fromEntries(new URLSearchParams(init.body));
  if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", email: "o@a.com" }));
  if (url.includes("/rest/v1/listing_owners")) return new Response(JSON.stringify([{ listing_id: LISTING }]));
  if (url.includes("/rest/v1/listing_billing") && method === "GET") return new Response(JSON.stringify(state.billing));
  if (url.includes("/rest/v1/listing_billing")) { if (init.body?.includes("stripe_customer_id")) state.billing = [{ stripe_customer_id: JSON.parse(init.body).stripe_customer_id, stripe_subscription_id: null, status: null }]; return new Response(null, { status: 204 }); }
  if (url.includes("/rest/v1/lead_assignments")) return new Response(JSON.stringify(state.assignment));
  if (url.includes("/rest/v1/listings")) return new Response(JSON.stringify([{ plan: "free", plan_until: null }]));
  if (url.includes("/rest/v1/leads")) return new Response(JSON.stringify([{ issue: "AC Not Cooling" }]));
  if (url.endsWith("/rpc/unlock_lead") || url.endsWith("/rpc/opportunity_reaches")) return new Response("true");
  if (url.endsWith("/rpc/unlock_opportunity")) return new Response("true");
  if (url.includes("/rest/v1/opportunity_unlocks")) return new Response("[]");
  if (url.includes("/rest/v1/public_permits")) return new Response(JSON.stringify([{ summary: "Residential HVAC: replace" }]));
  const j = (o) => new Response(JSON.stringify(o));
  if (url === "https://api.stripe.com/v1/customers" && method === "POST") return j({ id: "cus_new" });
  if (/\/v1\/customers\/cus_\w+$/.test(url) && method === "POST") { state.defaultPm = form()["invoice_settings[default_payment_method]"]; return j({ id: "cus_1" }); }
  if (/\/v1\/customers\/cus_\w+$/.test(url)) return j({ id: "cus_1", invoice_settings: { default_payment_method: state.defaultPm } });
  if (url.includes("/v1/payment_methods?")) return j({ data: state.pms });
  if (url.endsWith("/detach")) { state.pms = state.pms.filter((p) => !url.includes(p.id)); return j({}); }
  if (/\/v1\/payment_methods\/pm_\w+$/.test(url)) { const p = [...state.pms, state.other].find((x) => url.endsWith(x.id)); return p ? j(p) : new Response("{}", { status: 404 }); }
  if (/\/v1\/subscriptions\/sub_\w+$/.test(url)) return j({});
  if (url === "https://api.stripe.com/v1/checkout/sessions") return j({ url: "https://checkout.test/x" });
  if (url === "https://api.stripe.com/v1/invoices") return j({ id: "in_1" });
  if (url.endsWith("/v1/invoiceitems")) return j({ id: "ii_1" });
  if (url.endsWith("/finalize")) return j({ id: "in_1" });
  if (url.endsWith("/in_1/pay")) return state.payFails ? new Response(JSON.stringify({ error: { message: "Your card was declined." } }), { status: 402 }) : j({ status: "paid" });
  if (url.endsWith("/in_1/void")) return j({});
  throw new Error("unexpected " + method + " " + url);
};
const req = (body = {}, token = "tok") => new Request("https://site.test/x", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const post = async (fn, body) => { const r = await fn({ env, request: req(body) }); return { status: r.status, data: await r.json() }; };
const form = (call) => Object.fromEntries(new URLSearchParams(call.body));

// ---- listing
reset();
let r = await post(cards, { action: "list" });
assert.deepEqual(r.data.cards.map((c) => [c.id, c.brand, c.last4, c.isDefault]), [["pm_a", "visa", "4242", true], ["pm_b", "mastercard", "4444", false]]);
assert.ok(!JSON.stringify(r.data).match(/\d{13,}/), "no full card number ever");
reset(); state.defaultPm = null;
r = await post(cards, { action: "list" });
assert.equal(r.data.cards[0].isDefault, true, "the first card becomes the default when none is set");
assert.equal(state.defaultPm, "pm_a");
reset(); state.billing = [];
assert.deepEqual((await post(cards, { action: "list" })).data, { cards: [] }, "no customer yet, no cards");
assert.equal((await cards({ env, request: req({ action: "list" }, "") })).status, 401);
assert.equal((await cards({ env: { ...env, STRIPE_SECRET_KEY: undefined }, request: req({ action: "list" }) })).status, 501);
assert.equal((await post(cards, { action: "nope" })).status, 400);

// ---- adding a card: typed in on Stripe's page, never here
reset(); state.billing = [];
r = await post(cards, { action: "add" });
assert.equal(r.data.url, "https://checkout.test/x");
assert.equal(stripeCalls("/v1/customers").filter((c) => c.method === "POST").length, 1, "a Stripe customer is created for a business that has none");
let f = form(stripeCalls("/checkout/sessions")[0]);
assert.deepEqual([f.mode, f.customer, f["payment_method_types[0]"], f.success_url], ["setup", "cus_new", "card", "https://site.test/contractor/account?card=added"]);
reset();
await post(cards, { action: "add" });
assert.equal(form(stripeCalls("/checkout/sessions")[0]).customer, "cus_1", "an existing customer is reused");

// ---- default and remove: only this business's own cards
reset();
assert.equal((await post(cards, { action: "default", paymentMethodId: "pm_other" })).status, 404, "another business's card cannot be touched");
assert.equal((await post(cards, { action: "remove", paymentMethodId: "pm_other" })).status, 404);
assert.equal((await post(cards, { action: "default", paymentMethodId: "not-a-card" })).status, 404);
assert.equal(stripeCalls("/detach").length, 0);
r = await post(cards, { action: "default", paymentMethodId: "pm_b" });
assert.equal(state.defaultPm, "pm_b");
assert.equal(r.data.cards.find((c) => c.id === "pm_b").isDefault, true);
reset(); state.billing = [{ stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" }];
await post(cards, { action: "default", paymentMethodId: "pm_b" });
assert.equal(stripeCalls("/subscriptions/sub_1").length, 1, "plan renewals switch to the new default card too");
reset();
r = await post(cards, { action: "remove", paymentMethodId: "pm_a" });
assert.equal(stripeCalls("/detach").length, 1);
assert.deepEqual(r.data.cards.map((c) => c.id), ["pm_b"]);
assert.equal(r.data.cards[0].isDefault, true, "another card becomes the default when the default is removed");
reset(); state.pms = [state.pms[0]]; state.billing = [{ stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" }];
r = await post(cards, { action: "remove", paymentMethodId: "pm_a" });
assert.equal(r.status, 409, "the last card cannot go while a plan renews with it");
assert.equal(stripeCalls("/detach").length, 0);
reset(); state.pms = [state.pms[0]];
assert.equal((await post(cards, { action: "remove", paymentMethodId: "pm_a" })).status, 200, "without a plan the last card can be removed");

// ---- one-click payment with the default card
reset();
r = await post(unlock, { leadId: LEAD, useSavedCard: true });
assert.deepEqual(r.data, { unlocked: true, cents: 1000 });
const inv = form(stripeCalls("/v1/invoices")[0]);
assert.deepEqual([inv.customer, inv.default_payment_method, inv.pending_invoice_items_behavior, inv.collection_method], ["cus_1", "pm_a", "exclude", "charge_automatically"], "a one-off invoice that leaves other pending items alone");
const item = form(stripeCalls("/invoiceitems")[0]);
assert.deepEqual([item.invoice, item.amount, item.currency], ["in_1", "1000", "usd"], "the charge is attached to that invoice, at the server's price");
assert.ok(stripeCalls("/finalize").length === 1 && stripeCalls("/in_1/pay").length === 1);
assert.equal(form(stripeCalls("/in_1/pay")[0]).payment_method, "pm_a");
const rpc = log.find((l) => l.url.endsWith("/rpc/unlock_lead"));
assert.deepEqual(JSON.parse(rpc.body), { p_lead: LEAD, p_listing: LISTING, p_cents: 1000, p_ref: "in_1" }, "the request unlocks, with the invoice as the payment reference");
assert.equal(stripeCalls("/checkout/sessions").length, 0, "no Checkout page when the saved card works");

reset(); state.payFails = true;
r = await post(unlock, { leadId: LEAD, useSavedCard: true });
assert.equal(r.status, 402);
assert.equal(r.data.error, "card_declined");
assert.equal(stripeCalls("/in_1/void").length, 1, "a failed charge leaves nothing behind");
assert.equal(log.some((l) => l.url.endsWith("/rpc/unlock_lead")), false, "nothing unlocks without a payment");

reset();
r = await post(unlockOpp, { kind: "permit", itemId: ITEM, useSavedCard: true });
assert.equal(r.data.unlocked, true);
const orpc = log.find((l) => l.url.endsWith("/rpc/unlock_opportunity"));
assert.deepEqual(JSON.parse(orpc.body), { p_kind: "permit", p_item: ITEM, p_listing: LISTING, p_cents: 1000, p_ref: "in_1" });

reset(); state.billing = [];
r = await post(unlock, { leadId: LEAD, useSavedCard: true });
assert.ok(r.data.url, "no saved card, so it goes to the normal Checkout page");
f = form(stripeCalls("/checkout/sessions")[0]);
assert.equal(f["payment_intent_data[setup_future_usage]"], "off_session", "the card is kept on file for next time");

console.log("saved cards: all checks passed");
