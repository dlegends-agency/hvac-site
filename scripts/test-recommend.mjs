// Offline tests for customer recommendations and listing hours. Run: npm run test:recommend
import assert from "node:assert/strict";
import { checkRecommendation, displayName, hashIp, hashToken, isToken, newToken, renderConfirmEmail } from "../functions/_lib/recommend.ts";
import { onRequestPost as submit } from "../functions/api/recommend/submit.ts";
import { onRequestGet as confirm } from "../functions/api/recommend/confirm.ts";
import { parseHours } from "../functions/_lib/google.ts";
import { cleanHours, openStatus } from "../src/lib/hours.ts";
import { authLinkMessage, parseAuthLinkError } from "../src/lib/auth-link.ts";

// --- names: only first name and last initial are ever shown
assert.equal(displayName("Maria Lopez-Diaz"), "Maria L.");
assert.equal(displayName("  maria   lopez "), "maria L.");
assert.equal(displayName("Cher"), "Cher");
assert.equal(displayName("Zoë Éclair"), "Zoë É.");
for (const bad of ["", "A", "x1 y", "<b>Bob</b>", "http://spam.com", "5551234567", "Bob\nSmith; DROP"]) assert.equal(displayName(bad), null, bad);

// --- validation
const good = { slug: "acme-hvac-austin", name: "Maria Lopez", email: "Maria@Example.com ", body: "They fixed our AC the same day and explained the price first.", used: true };
const ok = checkRecommendation(good);
assert.ok(ok.ok && ok.value.shownName === "Maria L." && ok.value.email === "maria@example.com");
const err = (patch) => { const r = checkRecommendation({ ...good, ...patch }); assert.ok(!r.ok, JSON.stringify(patch)); return r.error; };
err({ slug: "Bad Slug!" }); err({ name: "1" }); err({ email: "nope" }); err({ email: "a@b" }); err({ used: false }); err({ used: "true" });
err({ body: "too short" }); err({ body: "x".repeat(1001) });
err({ body: "Great company, see https://spam.example for coupons and more" });
err({ body: "Great company, email me at someone@example.com for coupons" });
err({ body: "Great company, visit www.spam.example for coupons and more" });
assert.ok(!checkRecommendation(null).ok && !checkRecommendation("x").ok);

// --- tokens: random, hashed with SHA-256, and the link works with the token only
const t1 = newToken(), t2 = newToken();
assert.ok(isToken(t1) && t1 !== t2 && !isToken("abc") && !isToken(t1.toUpperCase()) && !isToken(null));
assert.equal(await hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
assert.notEqual(await hashToken(t1), t1);

const mail = renderConfirmEmail('Acme <script>x</script>\r\nBcc: evil@x.com', "https://site.test/api/recommend/confirm?t=abc");
assert.ok(!/[\r\n]/.test(mail.subject) && !mail.html.includes("<script>") && mail.html.includes("https://site.test/api/recommend/confirm?t=abc"));

// --- the endpoints, with Supabase and Resend simulated
const env = { SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", RESEND_API_KEY: "re", NOTIFY_FROM_EMAIL: "HVACHelp <a@site.test>", VITE_SITE_URL: "https://site.test" };
const post = (body, e = env) => submit({ env: e, request: new Request("https://site.test/api/recommend/submit", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.7" }, body: typeof body === "string" ? body : JSON.stringify(body) }) });

let rows, inserted, mailed, deleted, insertStatus, resendOk, patchRows, patchedWith;
const reset = () => { rows = { listing: [{ id: "L1", business_name: "Acme HVAC" }], byEmail: [], byListing: [], bySender: [] }; inserted = []; mailed = []; deleted = 0; insertStatus = 201; resendOk = true; patchRows = [{ listing_id: "L1" }]; patchedWith = null; };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const method = init.method ?? "GET";
  if (url.includes("/rest/v1/listings?slug=")) return new Response(JSON.stringify(rows.listing), { status: 200 });
  if (url.includes("/rest/v1/listings?id=")) return new Response(JSON.stringify([{ slug: "acme-hvac-austin" }]), { status: 200 });
  if (url.includes("listing_recommendations?author_email=eq.")) return new Response(JSON.stringify(rows.byEmail), { status: 200 });
  if (url.includes("listing_recommendations?ip_hash=eq.")) return new Response(JSON.stringify(rows.bySender), { status: 200 });
  if (url.includes("listing_recommendations?listing_id=eq.")) return new Response(JSON.stringify(rows.byListing), { status: 200 });
  if (url.endsWith("/rest/v1/listing_recommendations") && method === "POST") { inserted.push(JSON.parse(init.body)); return new Response(null, { status: insertStatus }); }
  if (url.includes("listing_recommendations?token_hash=eq.") && method === "DELETE") { deleted++; return new Response(null, { status: 204 }); }
  if (url.includes("listing_recommendations?token_hash=eq.") && method === "PATCH") { patchedWith = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify(patchRows), { status: 200 }); }
  if (url === "https://api.resend.com/emails") { mailed.push(JSON.parse(init.body)); return resendOk ? new Response("{}", { status: 200 }) : new Response('{"message":"bad"}', { status: 422 }); }
  throw new Error(`unexpected fetch ${method} ${url}`);
};

reset();
let res = await post(good);
assert.equal(res.status, 200);
assert.equal(inserted.length, 1);
assert.equal(inserted[0].author_name, "Maria L.");
assert.equal(inserted[0].author_email, "maria@example.com");
assert.equal(inserted[0].listing_id, "L1");
assert.equal(inserted[0].token_hash.length, 64);
assert.equal(inserted[0].ip_hash, await hashIp("203.0.113.7", "svc"), "only a salted hash of the sender is stored");
assert.ok(!JSON.stringify(inserted[0]).includes("203.0.113.7"), "never the address itself");
assert.notEqual(await hashIp("203.0.113.7", "svc"), await hashIp("203.0.113.7", "other"), "the salt matters");
assert.match((await res.json()).message, /Check your email/);
assert.ok(!("token" in inserted[0]) && !JSON.stringify(inserted[0]).includes("status"), "the token itself is not stored and status is left to the database default");
assert.equal(mailed.length, 1);
assert.deepEqual(mailed[0].to, ["maria@example.com"]);
const token = /confirm\?t=([a-f0-9]{64})/.exec(mailed[0].text)[1];
assert.equal(await hashToken(token), inserted[0].token_hash, "the emailed token matches the stored hash");

reset(); res = await post({ ...good, website: "http://bot.example" });
assert.equal(res.status, 200); assert.equal(inserted.length, 0); assert.equal(mailed.length, 0, "a filled trap field saves and sends nothing");
reset(); res = await post({ ...good, body: "short" }); assert.equal(res.status, 400); assert.equal(inserted.length, 0);
reset(); res = await post("not json"); assert.equal(res.status, 400);
reset(); rows.listing = []; res = await post(good); assert.equal(res.status, 404, "unknown or unpublished business");
reset(); rows.byEmail = [{}, {}, {}]; res = await post(good); assert.equal(res.status, 429); assert.equal(mailed.length, 0, "3 per email per day");
reset(); rows.byListing = Array.from({ length: 10 }, () => ({})); res = await post(good); assert.equal(res.status, 429, "10 unconfirmed per business per hour");
reset(); insertStatus = 409; res = await post(good);
assert.equal(res.status, 200); assert.equal(mailed.length, 0, "a repeat for the same business sends nothing and looks the same");
reset(); rows.bySender = Array.from({ length: 6 }, () => ({})); res = await post(good); assert.equal(res.status, 429); assert.equal(inserted.length, 0, "6 per sender per day");
reset(); resendOk = false; res = await post(good);
assert.equal(res.status, 200); assert.equal(inserted.length, 1); assert.equal(deleted, 0, "if the confirmation email cannot be sent the recommendation is still saved");
assert.doesNotMatch((await res.json()).message, /Check your email/);
reset(); res = await post(good, { ...env, RESEND_API_KEY: undefined });
assert.equal(res.status, 200, "no email service: the recommendation is still saved for the business to review");
assert.equal(inserted.length, 1); assert.equal(mailed.length, 0);
assert.match((await res.json()).message, /sent to the business/);
reset(); res = await post(good, { ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }); assert.equal(res.status, 501); assert.equal(inserted.length, 0);

// --- confirming
const get = (t) => confirm({ env, request: new Request(`https://site.test/api/recommend/confirm${t === undefined ? "" : `?t=${t}`}`) });
reset(); res = await get(token);
assert.equal(res.status, 302); assert.equal(res.headers.get("Location"), "https://site.test/directory/acme-hvac-austin?recommendation=confirmed");
assert.ok(patchedWith.url.includes(`token_hash=eq.${await hashToken(token)}`) && patchedWith.url.includes("email_confirmed_at=is.null") && patchedWith.url.includes("created_at=gt."), "only an unconfirmed, recent row can be confirmed");
assert.deepEqual(Object.keys(patchedWith.body), ["email_confirmed_at"], "confirming never approves");
reset(); patchRows = []; res = await get(token); assert.equal(res.status, 410, "used or expired link");
reset(); res = await get("nope"); assert.equal(res.status, 400); assert.equal(patchedWith, null);
reset(); res = await get(undefined); assert.equal(res.status, 400);

// --- opening hours
assert.deepEqual(cleanHours({ mon: { open: "08:00", close: "17:00" }, tue: { open: "17:00", close: "08:00" }, wed: { open: "8:00", close: "17:00" } }),
  { mon: { open: "08:00", close: "17:00" }, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, "bad days become closed");
assert.equal(cleanHours({ mon: null }), null); assert.equal(cleanHours(null), null); assert.equal(cleanHours({}), null);
const hours = { mon: { open: "08:00", close: "17:00" }, tue: { open: "08:00", close: "17:00" }, sat: { open: "09:00", close: "12:00" } };
// 2026-11-02 is a Monday. Texas is on Central time (UTC-6 in November).
const at = (iso) => new Date(iso);
assert.deepEqual(openStatus(hours, "Texas", at("2026-11-02T15:00:00Z")), { open: true, text: "Open now · closes 5:00 PM" });
assert.deepEqual(openStatus(hours, "Texas", at("2026-11-02T12:00:00Z")), { open: false, text: "Closed · opens 8:00 AM" }, "6 AM Monday");
assert.deepEqual(openStatus(hours, "Texas", at("2026-11-03T00:30:00Z")), { open: false, text: "Closed · opens tomorrow 8:00 AM" }, "6:30 PM Monday");
assert.deepEqual(openStatus(hours, "Texas", at("2026-11-07T19:00:00Z")), { open: false, text: "Closed · opens Mon 8:00 AM" }, "1 PM Saturday: the next open day is Monday");
assert.equal(openStatus(hours, "Narnia", at("2026-11-02T15:00:00Z")), null, "unknown state: no live status");
assert.equal(openStatus(null, "Texas"), null);

// --- Google's hours
assert.deepEqual(parseHours({ regularOpeningHours: { weekdayDescriptions: ["Monday: 8:00 AM – 5:00 PM", "Tuesday: Closed"], openNow: true } }), { lines: ["Monday: 8:00 AM – 5:00 PM", "Tuesday: Closed"], openNow: true });
assert.equal(parseHours({ regularOpeningHours: { weekdayDescriptions: [] } }), null);
assert.equal(parseHours({}), null); assert.equal(parseHours(null), null);
assert.equal(parseHours({ regularOpeningHours: { weekdayDescriptions: ["x".repeat(200), 5] } }), null, "over-long or non-text lines are dropped");

// --- a bad email link
assert.deepEqual(parseAuthLinkError("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb="), { code: "otp_expired", description: "Email link is invalid or has expired" });
assert.deepEqual(parseAuthLinkError("#error=server_error"), { code: "server_error", description: "" });
for (const none of ["", "#", "#access_token=abc&type=signup", "#/section"]) assert.equal(parseAuthLinkError(none), null, none);
assert.ok(authLinkMessage({ code: "otp_expired", description: "" }).includes("send yourself a new link"));
assert.ok(authLinkMessage({ code: "server_error", description: "boom" }).includes("boom"));

console.log("recommendations and hours: all passed");
