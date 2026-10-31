// Offline tests for the email alert code. Run: npm run test:notify
import assert from "node:assert/strict";
import { escapeHtml, renderLeadEmail, secretsMatch } from "../functions/_lib/email.ts";
import { onRequestPost } from "../functions/api/notify/send.ts";

// --- rendering
const alert = { business_name: 'Acme <script>alert(1)</script> & Sons', issue: "AC Not Cooling, Thermostat Problem", urgency: "Immediately", city: "Austin", state: "Texas", lead_created_at: "2026-10-30T12:00:00Z" };
const mail = renderLeadEmail(alert, "https://site.test");
assert.equal(mail.subject, "Urgent: New HVAC request: AC Not Cooling, Thermostat Problem");
assert.ok(mail.html.includes("https://site.test/contractor/leads?status=new") && mail.text.includes("https://site.test/contractor/leads?status=new"));
assert.ok(!mail.html.includes("<script>") && mail.html.includes("&lt;script&gt;"), "user text is escaped in HTML");
assert.ok(mail.html.includes("AC Not Cooling, Thermostat Problem") && mail.text.includes("Problem: AC Not Cooling, Thermostat Problem"));
assert.ok(mail.html.includes("turn these emails off") && mail.text.includes("turn these emails off"));
for (const place of ["Austin", "Texas"]) assert.ok(!mail.html.includes(place) && !mail.text.includes(place) && !mail.subject.includes(place), `${place} (where the customer is) stays behind the unlock`);
assert.equal(renderLeadEmail({ ...alert, urgency: "Flexible timing" }, "https://site.test").subject, "New HVAC request: AC Not Cooling, Thermostat Problem", "not marked urgent");
const injected = renderLeadEmail({ ...alert, issue: "x\r\nBcc: evil@x.com" }, "https://site.test");
assert.ok(!/[\r\n]/.test(injected.subject), "no header injection through the subject");
assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
assert.ok(secretsMatch("abc123", "abc123") && !secretsMatch("abc123", "abc124") && !secretsMatch("abc", "abcd") && !secretsMatch("", "") && !secretsMatch(null, "x"));

// --- the endpoint, with Supabase and Resend simulated
const env = { NOTIFY_SECRET: "s3cret", RESEND_API_KEY: "re_test", NOTIFY_FROM_EMAIL: "HVACHelp <leads@site.test>", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SITE_URL: "https://site.test" };
const call = (e, secret) => onRequestPost({ env: e, request: new Request("https://site.test/api/notify/send", { method: "POST", headers: secret ? { "X-Notify-Secret": secret } : {} }) });

let pending, resendCalls, finishArgs, failTo;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.endsWith("/rpc/claim_lead_notifications")) return new Response(JSON.stringify(pending), { status: 200 });
  if (url.endsWith("/rpc/finish_lead_notifications")) { finishArgs = JSON.parse(init.body); return new Response("null", { status: 200 }); }
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(init.body); resendCalls.push({ body, auth: init.headers.Authorization });
    return body.to[0] === failTo ? new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 }) : new Response("{}", { status: 200 });
  }
  throw new Error("unexpected request " + url);
};
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, email: `c${i}@x.com`, ...alert }));
const reset = (p) => { pending = p; resendCalls = []; finishArgs = null; failTo = null; };

reset(rows(1));
assert.equal((await call(env, null)).status, 403, "no secret");
assert.equal((await call(env, "wrong")).status, 403, "wrong secret");
assert.equal(resendCalls.length, 0, "nothing sent without the secret");
assert.equal((await call({ ...env, RESEND_API_KEY: undefined }, "s3cret")).status, 501, "not configured");

reset(rows(3));
let res = await call(env, "s3cret");
assert.deepEqual(await res.json(), { sent: 3, failed: 0, more: false });
assert.equal(resendCalls.length, 3);
assert.equal(resendCalls[0].auth, "Bearer re_test");
assert.equal(resendCalls[0].body.from, "HVACHelp <leads@site.test>");
assert.deepEqual(resendCalls.map((c) => c.body.to[0]), ["c0@x.com", "c1@x.com", "c2@x.com"]);
assert.deepEqual(finishArgs.p_sent, ["id0", "id1", "id2"]);
assert.ok(!resendCalls[0].body.html.includes("@x.com"), "contractor/customer addresses are not echoed in the body");

reset(rows(3)); failTo = "c1@x.com";
res = await call(env, "s3cret");
assert.deepEqual(await res.json(), { sent: 2, failed: 1, more: false });
assert.deepEqual(finishArgs.p_sent, ["id0", "id2"]);
assert.deepEqual(finishArgs.p_failed, { id1: "Resend 403: Domain not verified" }, "failure reason recorded for retry");

reset([]);
res = await call(env, "s3cret");
assert.deepEqual(await res.json(), { sent: 0, failed: 0, more: false });
assert.equal(finishArgs, null, "nothing to record");

reset(rows(25));
assert.equal((await (await call(env, "s3cret")).json()).more, true, "tells the caller there may be more");

console.log("notify: all checks passed");
