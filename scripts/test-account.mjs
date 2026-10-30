// Offline tests for the account payment endpoints (card on file, payment history, billing portal). Run: npm run test:account
import assert from "node:assert/strict";
import { onRequestPost as account } from "../functions/api/stripe/account.ts";
import { onRequestPost as portal } from "../functions/api/stripe/portal.ts";

const env = {
  STRIPE_SECRET_KEY: "sk_test", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub",
  STRIPE_PRICE_FEATURED: "price_f", STRIPE_PRICE_PREMIUM: "price_p", VITE_SITE_URL: "https://site.test",
};
const req = (body = {}, token = "tok") => new Request("https://site.test/api/stripe/x", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });

let owner, billing, stripeRoutes, log;
globalThis.fetch = async (url, init = {}) => {
  url = String(url); log.push({ url, method: init.method ?? "GET", body: init.body });
  if (url.endsWith("/auth/v1/user")) return init.headers.Authorization === "Bearer tok" ? new Response(JSON.stringify({ id: "u1", email: "o@a.com" })) : new Response("{}", { status: 401 });
  if (url.includes("/rest/v1/listing_owners")) return new Response(JSON.stringify(owner));
  if (url.includes("/rest/v1/listing_billing")) return new Response(JSON.stringify(billing));
  if (url.startsWith("https://api.stripe.com/v1")) {
    const path = url.replace("https://api.stripe.com/v1", "").split("?")[0];
    const handler = stripeRoutes[`${init.method ?? "GET"} ${path}`];
    if (!handler) return new Response(JSON.stringify({ error: { message: `no route ${path}` } }), { status: 404 });
    const out = handler(url, init);
    return out instanceof Response ? out : new Response(JSON.stringify(out));
  }
  throw new Error("unexpected " + url);
};
const reset = () => { owner = [{ listing_id: "L1" }]; billing = [{ stripe_customer_id: "cus_1", status: "active", stripe_subscription_id: "sub_1" }]; log = []; stripeRoutes = {}; };

const card = { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 };
const invoices = { data: [
  { id: "in_3", number: "A-0003", created: 1_790_000_000, total: 4900, amount_paid: 4900, currency: "usd", status: "paid", hosted_invoice_url: "https://stripe.test/i3", invoice_pdf: "https://stripe.test/i3.pdf", lines: { data: [{ price: { id: "price_f" } }] } },
  { id: "in_2", number: null, created: 1_780_000_000, total: 4900, amount_paid: 0, currency: "usd", status: "open", hosted_invoice_url: null, invoice_pdf: null, lines: { data: [{ price: { id: "price_f" } }] } },
  { id: "in_1", number: "A-0001", created: 1_770_000_000, total: 9900, amount_paid: 9900, currency: "usd", status: "paid", hosted_invoice_url: "https://stripe.test/i1", invoice_pdf: null, lines: { data: [{ price: { id: "price_p" } }] } },
  { id: "in_draft", number: null, created: 1_760_000_000, total: 100, amount_paid: 0, currency: "usd", status: "draft", lines: { data: [] } },
] };
const sub = { status: "active", cancel_at_period_end: true, current_period_end: 1_900_000_000, default_payment_method: { id: "pm_1", card }, items: { data: [{ price: { id: "price_f" } }] } };

// --- access control
reset();
assert.equal((await account({ env, request: req({}, "") })).status, 401, "no token");
assert.equal((await account({ env, request: req({}, "bad") })).status, 401, "bad token");
assert.equal((await account({ env: { ...env, STRIPE_SECRET_KEY: undefined }, request: req() })).status, 501);
owner = [];
assert.equal((await account({ env, request: req() })).status, 403, "no approved listing");
reset(); billing = [];
assert.deepEqual(await (await account({ env, request: req() })).json(), { card: null, invoices: [], subscription: null }, "no Stripe customer yet");

// --- card, subscription and history
reset();
stripeRoutes = { "GET /invoices": () => invoices, "GET /subscriptions/sub_1": () => sub };
let out = await (await account({ env, request: req() })).json();
assert.deepEqual(out.card, card);
assert.deepEqual(out.subscription, { status: "active", cancel_at_period_end: true, current_period_end: new Date(1_900_000_000 * 1000).toISOString(), plan: "featured" });
assert.deepEqual(out.invoices.map((i) => [i.number, i.amount, i.status, i.plan]), [["A-0003", 4900, "paid", "featured"], [null, 4900, "open", "featured"], ["A-0001", 9900, "paid", "premium"]], "drafts hidden, plans named, unpaid shows the amount due");
assert.equal(out.invoices[0].url, "https://stripe.test/i3");
const inv = log.find((l) => l.url.includes("/invoices"));
assert.ok(inv.url.includes("customer=cus_1") && inv.url.includes("limit=24") && inv.body === undefined, "GET parameters go in the query string");
assert.ok(!JSON.stringify(out).includes("pm_1") && !JSON.stringify(out).includes("cus_1"), "no internal Stripe ids besides invoice ids");

// card falls back: subscription has none -> customer default -> any card
reset();
stripeRoutes = { "GET /invoices": () => ({ data: [] }), "GET /subscriptions/sub_1": () => ({ ...sub, default_payment_method: null }),
  "GET /customers/cus_1": () => ({ invoice_settings: { default_payment_method: { card: { ...card, last4: "1111" } } } }) };
assert.equal((await (await account({ env, request: req() })).json()).card.last4, "1111");
reset();
stripeRoutes = { "GET /invoices": () => ({ data: [] }), "GET /subscriptions/sub_1": () => ({ ...sub, default_payment_method: null }),
  "GET /customers/cus_1": () => ({ invoice_settings: {} }), "GET /payment_methods": () => ({ data: [{ id: "pm_9", card: { ...card, last4: "9999" } }] }) };
assert.equal((await (await account({ env, request: req() })).json()).card.last4, "9999");
reset(); stripeRoutes = { "GET /invoices": () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }) };
assert.equal((await account({ env, request: req() })).status, 502, "Stripe failure is reported, not leaked");

// --- billing portal: opens on the card page, falls back to the normal portal
reset();
stripeRoutes = { "POST /billing_portal/sessions": (url, init) => ({ url: init.body.includes("flow_data%5Btype%5D=payment_method_update") ? "https://portal.test/card" : "https://portal.test/home" }) };
assert.equal((await (await portal({ env, request: req({ flow: "card" }) })).json()).url, "https://portal.test/card");
assert.equal((await (await portal({ env, request: req({}) })).json()).url, "https://portal.test/home");
const returns = log.filter((l) => l.url.endsWith("/billing_portal/sessions")).map((l) => decodeURIComponent(new URLSearchParams(l.body).get("return_url")));
assert.deepEqual(returns, ["https://site.test/contractor/account", "https://site.test/contractor/billing"], "returns to the page the contractor came from");
reset();
let attempts = 0;
stripeRoutes = { "POST /billing_portal/sessions": (url, init) => (init.body.includes("flow_data") ? (attempts++, new Response(JSON.stringify({ error: { message: "not enabled" } }), { status: 400 })) : { url: "https://portal.test/home" }) };
assert.equal((await (await portal({ env, request: req({ flow: "card" }) })).json()).url, "https://portal.test/home", "falls back when the card deep link is refused");
assert.equal(attempts, 1);
reset(); billing = [{ stripe_customer_id: null }];
assert.equal((await portal({ env, request: req({ flow: "card" }) })).status, 404, "no subscription yet");
assert.equal((await portal({ env, request: req({}, "") })).status, 401);

console.log("account endpoints: all checks passed");
