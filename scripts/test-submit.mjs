// Offline tests for the CAPTCHA check and the public form endpoints (/api/submit/*). Run: npm run test:submit
import assert from "node:assert/strict";
import { verifyCaptcha } from "../functions/_lib/captcha.ts";
import { pickFields } from "../functions/_lib/submit.ts";
import { onRequestPost as lead } from "../functions/api/submit/lead.ts";
import { onRequestPost as contact } from "../functions/api/submit/contact.ts";
import { onRequestPost as listing } from "../functions/api/submit/listing.ts";
import { onRequestPost as recommend } from "../functions/api/recommend/submit.ts";

// --- field picking: only allowed fields, right types, length caps
const spec = { name: "t", note: "T?", ok: "b", id: "u", slug: "slug", opt: "t?" };
const good = { name: "A", ok: true, id: "123e4567-e89b-12d3-a456-426614174000", slug: "a-b" };
assert.deepEqual(pickFields({ ...good, status: "published", plan: "featured", note: "" }, spec), { ok: true, value: good }, "unknown fields are dropped and empty optional ones skipped");
for (const bad of [{ ...good, name: undefined }, { ...good, name: "x".repeat(301) }, { ...good, ok: "true" }, { ...good, id: "nope" }, { ...good, slug: "Bad Slug" }, { ...good, name: 5 }]) assert.equal(pickFields(bad, spec).ok, false);
assert.equal(pickFields({ ...good, note: "x".repeat(2000) }, spec).ok, true);
assert.equal(pickFields({ ...good, note: "x".repeat(2001) }, spec).ok, false);
assert.equal(pickFields(null, spec).ok, false);

// --- Turnstile
const base = { SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub", RESEND_API_KEY: "re", NOTIFY_FROM_EMAIL: "a <a@site.test>" };
let verifyCalls, verifyOk, saved, saveStatus, leadStatusSequence;
const reset = () => { verifyCalls = []; verifyOk = true; saved = []; saveStatus = 201; leadStatusSequence = null; };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") { verifyCalls.push(Object.fromEntries(new URLSearchParams(String(init.body)))); return new Response(JSON.stringify({ success: verifyOk }), { status: 200 }); }
  if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "ann@x.com" }), { status: 200 });
  if (url.includes("/rest/v1/")) {
    const table = url.split("/rest/v1/")[1].split("?")[0];
    if ((init.method ?? "GET") === "POST") {
      const body = JSON.parse(init.body);
      saved.push({ table, body });
      const status = leadStatusSequence ? leadStatusSequence.shift() : saveStatus;
      return new Response(null, { status });
    }
    if (url.includes("listings?slug=")) return new Response(JSON.stringify([{ id: "L1", business_name: "Acme" }]), { status: 200 });
    return new Response("[]", { status: 200 });
  }
  if (url === "https://api.resend.com/emails") return new Response("{}", { status: 200 });
  throw new Error(`unexpected fetch ${url}`);
};
reset();
assert.deepEqual(await verifyCaptcha({}, undefined), { ok: true, skipped: true }, "no secret: nothing is checked, forms keep working");
const withSecret = { ...base, TURNSTILE_SECRET_KEY: "sec" };
assert.deepEqual(await verifyCaptcha(withSecret, "tok", "1.2.3.4"), { ok: true, skipped: false });
assert.deepEqual(verifyCalls[0], { secret: "sec", response: "tok", remoteip: "1.2.3.4" });
for (const t of [undefined, null, "", 5, "x".repeat(5000)]) assert.equal((await verifyCaptcha(withSecret, t)).ok, false, `token ${String(t).slice(0, 5)}`);
verifyOk = false; assert.equal((await verifyCaptcha(withSecret, "tok")).ok, false, "Cloudflare says no");
reset();

const post = (fn, body, env = withSecret, headers = {}) => fn({ env, request: new Request("https://site.test/api/x", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }) });
const leadBody = { captcha: "tok", idempotency_key: "k1", source: "homepage", issue: "AC Not Cooling", urgency: "Immediately", country: "US", state: "Texas", city: "Austin", postal_code: "78701", street: "1 Main St", unit: null,
  first_name: "Jane", last_name: "Doe", phone: "5125550100", email: "jane@x.com", contact_method: "Phone", description: "Warm air", property_type: "Residential", property_status: "Homeowner", preferred_contact_time: null,
  referral_acknowledgment: true, marketing_consent: false };

// --- lead
let res = await post(lead, leadBody);
assert.equal(res.status, 200); assert.equal(saved.length, 1); assert.equal(saved[0].table, "leads");
assert.ok(!("captcha" in saved[0].body) && !("customer_id" in saved[0].body) && !("status" in saved[0].body), "no captcha token stored, no link for a signed-out visitor");
reset(); verifyOk = false; res = await post(lead, leadBody);
assert.equal(res.status, 400); assert.equal((await res.json()).captcha, true); assert.equal(saved.length, 0, "a failed security check saves nothing");
reset(); res = await post(lead, { ...leadBody, captcha: undefined }); assert.equal(res.status, 400); assert.equal(saved.length, 0, "no token, no lead");
reset(); res = await post(lead, { ...leadBody, status: "published", assigned_listing_id: "x", customer_id: "someone-else" });
assert.equal(res.status, 200); assert.deepEqual(Object.keys(saved[0].body).filter((k) => ["status", "assigned_listing_id", "customer_id"].includes(k)), [], "a visitor cannot set status, assignment or an account link");
reset(); res = await post(lead, { ...leadBody, referral_acknowledgment: false }); assert.equal(res.status, 400); assert.equal(saved.length, 0);
reset(); res = await post(lead, { ...leadBody, email: undefined }); assert.equal(res.status, 400);
reset(); res = await post(lead, leadBody, withSecret, { Authorization: "Bearer abc" });
assert.equal(saved[0].body.customer_id, "user-1", "a signed-in customer's request is linked to their account");
reset(); leadStatusSequence = [400, 201]; res = await post(lead, leadBody, withSecret, { Authorization: "Bearer abc" });
assert.equal(res.status, 200); assert.equal(saved.length, 2); assert.ok(!("customer_id" in saved[1].body), "without the customer_id column the request is still saved");
reset(); saveStatus = 409; res = await post(lead, leadBody); assert.equal(res.status, 200, "the same request twice is stored once");
reset(); saveStatus = 400; res = await post(lead, leadBody); assert.equal(res.status, 400);
reset(); saveStatus = 500; res = await post(lead, leadBody); assert.equal(res.status, 502);
reset(); res = await post(lead, "not json"); assert.equal(res.status, 400);
reset(); res = await post(lead, leadBody, { ...withSecret, SUPABASE_SERVICE_ROLE_KEY: undefined }); assert.equal(res.status, 501);
reset(); res = await post(lead, leadBody, base); assert.equal(res.status, 200, "CAPTCHA not configured yet: the form still works");

// --- contact
reset(); res = await post(contact, { captcha: "tok", name: "Jo", email: "jo@x.com", topic: "General", message: "Hello there friend", status: "read" });
assert.equal(res.status, 200); assert.deepEqual(Object.keys(saved[0].body).sort(), ["email", "message", "name", "topic"]);
reset(); verifyOk = false; res = await post(contact, { captcha: "tok", name: "Jo", email: "jo@x.com", topic: "General", message: "Hello there friend" }); assert.equal(res.status, 400); assert.equal(saved.length, 0);

// --- listing
const listingBody = { captcha: "tok", id: "123e4567-e89b-12d3-a456-426614174000", slug: "acme-austin-123e", business_name: "Acme HVAC", phone: "5125550100", address: "1 Main St", city: "Austin", state: "Texas", postal_code: "78701", submitter_name: "Sam", submitter_email: "sam@x.com", status: "published", plan: "featured" };
reset(); res = await post(listing, listingBody);
assert.equal(res.status, 200); assert.equal(saved.length, 2);
assert.deepEqual([saved[0].table, saved[0].body.status, saved[0].body.plan, saved[0].body.source], ["listings", "pending", "free", "submitted"], "always a pending free listing, whatever the form says");
assert.deepEqual([saved[1].table, saved[1].body.listing_id, saved[1].body.submitter_email], ["listing_private", listingBody.id, "sam@x.com"]);
reset(); verifyOk = false; res = await post(listing, listingBody); assert.equal(res.status, 400); assert.equal(saved.length, 0);
reset(); res = await post(listing, { ...listingBody, slug: "Not A Slug" }); assert.equal(res.status, 400); assert.equal(saved.length, 0);
reset(); saveStatus = 409; res = await post(listing, listingBody); assert.equal(res.status, 409);

// --- recommendation form uses the same check
const recBody = { captcha: "tok", slug: "acme-austin", name: "Maria Lopez", email: "maria@example.com", body: "They fixed our AC the same day and were fair.", used: true };
reset(); res = await post(recommend, recBody); assert.equal(res.status, 200); assert.equal(saved.filter((s) => s.table === "listing_recommendations").length, 1);
reset(); verifyOk = false; res = await post(recommend, recBody); assert.equal(res.status, 400); assert.equal((await res.json()).captcha, true); assert.equal(saved.length, 0);

console.log("submit endpoints and captcha: all passed");
