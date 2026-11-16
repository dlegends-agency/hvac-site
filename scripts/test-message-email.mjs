// Offline tests for emailing a customer a message that a business sent through the site. Run: npm run test:message-email
import assert from "node:assert/strict";
import { renderMessageEmail } from "../functions/_lib/email.ts";
import { onRequestPost as emailMessage } from "../functions/api/messages/email.ts";

const env = { RESEND_API_KEY: "re_test", NOTIFY_FROM_EMAIL: "HVACHelp <onboarding@resend.dev>", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub", VITE_SITE_URL: "https://site.test" };
const LISTING = "22222222-2222-4222-8222-222222222222";
const LEAD = "11111111-1111-4111-8111-111111111111";

// ---- the email itself
const mail = renderMessageEmail({ business_name: "Cool <b>Air</b> Houston", customer_name: "Chelsea", issue: "AC Not Cooling", body: "Hi Chelsea,\nI can come <script>x</script> tomorrow." }, "https://site.test/account/messages?lead=1&listing=2");
assert.equal(mail.subject, "New message from Cool <b>Air</b> Houston about your HVAC request");
assert.ok(mail.html.includes("Hi Chelsea,\nI can come &lt;script&gt;x&lt;/script&gt; tomorrow."), "the message is shown in full, escaped");
assert.ok(!mail.html.includes("<script>") && !mail.html.includes("<b>Air</b>"), "nothing from the sender is injected as HTML");
assert.ok(mail.html.includes("https://site.test/account/messages?lead=1&amp;listing=2") && mail.text.includes("https://site.test/account/messages?lead=1&listing=2"), "a link to read and reply");
assert.ok(mail.text.includes("Hi Chelsea,") && mail.text.includes("I can come <script>x</script> tomorrow."));
assert.ok(mail.html.includes("Replies are sent through the site"), "replies stay on the site");
assert.ok(!/@|\d{3}[-) ]\d{3}-\d{4}/.test(mail.text.replace(/https?:\/\/\S+/g, "")), "no email address or phone number from the business");
assert.ok(!renderMessageEmail({ business_name: "A", customer_name: "", issue: "x", body: "y" }, "https://s").text.includes("undefined"));
const injected = renderMessageEmail({ business_name: "X\r\nBcc: evil@x.com", customer_name: "A", issue: "i", body: "b" }, "https://s");
assert.ok(!/[\r\n]/.test(injected.subject), "no header injection through the subject");

// ---- the endpoint, with Supabase and Resend simulated
let state, log, resend;
const reset = () => {
  state = {
    owner: [{ listing_id: LISTING }],
    info: [{ id: 7, lead_id: LEAD, listing_id: LISTING, sender: "business", body: "Hi, I can come tomorrow.", created_at: new Date().toISOString(), emailed_at: null, customer_email: "chelsea@yopmail.com", customer_name: "Chelsea", issue: "AC Not Cooling", business_name: "Cool Air Houston" }],
    resendOk: true,
  };
  log = [];
  resend = [];
};
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  log.push({ url, body: init.body });
  if (url.endsWith("/auth/v1/user")) return init.headers.Authorization === "Bearer tok" ? new Response(JSON.stringify({ id: "u1", email: "o@a.com" })) : new Response("{}", { status: 401 });
  if (url.includes("/rest/v1/listing_owners")) return new Response(JSON.stringify(state.owner));
  if (url.endsWith("/rpc/message_email_info")) return new Response(JSON.stringify(state.info));
  if (url.endsWith("/rpc/mark_message_emailed")) return new Response("null");
  if (url === "https://api.resend.com/emails") {
    resend.push(JSON.parse(init.body));
    return state.resendOk ? new Response("{}") : new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 });
  }
  throw new Error("unexpected " + url);
};
const call = async (body, e = env, token = "tok") => {
  const r = await emailMessage({ env: e, request: new Request("https://site.test/api/messages/email", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
};
const marks = () => log.filter((l) => l.url.endsWith("/rpc/mark_message_emailed")).map((l) => JSON.parse(l.body));

reset();
assert.equal((await call({ messageId: 7 }, env, "")).status, 401, "not signed in");
assert.equal((await call({ messageId: 7 }, { ...env, RESEND_API_KEY: undefined })).status, 501, "email not set up: the message stays in the dashboard");
assert.equal((await call({ messageId: "x" })).status, 400);
assert.equal((await call({ messageId: -3 })).status, 400);
assert.equal(resend.length, 0);
state.owner = [];
assert.equal((await call({ messageId: 7 })).status, 403, "no approved listing");

reset();
let r = await call({ messageId: 7 });
assert.deepEqual(r.data, { emailed: true });
assert.equal(resend.length, 1);
assert.deepEqual(resend[0].to, ["chelsea@yopmail.com"], "the customer's address is read on the server, never from the browser");
assert.equal(resend[0].from, "HVACHelp <onboarding@resend.dev>");
assert.ok(resend[0].html.includes("Hi, I can come tomorrow."));
assert.ok(resend[0].html.includes("https://site.test/account/messages?lead=" + LEAD + "&amp;listing=" + LISTING));
assert.deepEqual(marks(), [{ p_message: 7 }], "recorded as emailed");

reset(); state.info[0].listing_id = "99999999-9999-4999-8999-999999999999";
assert.equal((await call({ messageId: 7 })).status, 404, "another business's message cannot be emailed from this account");
reset(); state.info[0].sender = "customer";
assert.equal((await call({ messageId: 7 })).status, 404, "only a message from the business is emailed");
reset(); state.info = [];
assert.equal((await call({ messageId: 7 })).status, 404);
reset(); state.info[0].emailed_at = new Date().toISOString();
r = await call({ messageId: 7 });
assert.deepEqual(r.data, { emailed: true, already: true }, "never emailed twice");
assert.equal(resend.length, 0);
reset(); state.info[0].created_at = new Date(Date.now() - 30 * 60_000).toISOString();
assert.equal((await call({ messageId: 7 })).status, 409, "an old message cannot be re-sent");
assert.equal(resend.length, 0);
reset(); state.info[0].customer_email = null;
assert.deepEqual((await call({ messageId: 7 })).data, { emailed: false, reason: "The customer has no email address on file" });
reset(); state.resendOk = false;
r = await call({ messageId: 7 });
assert.deepEqual(r.data, { emailed: false, reason: "The email could not be sent" }, "the contractor is told the email failed");
assert.deepEqual(marks(), [{ p_message: 7, p_error: "Resend 403: Domain not verified" }], "the reason is kept for later");

console.log("message email: all checks passed");
