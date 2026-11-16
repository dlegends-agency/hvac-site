// Offline tests for emailing the contact on a permit or a bid through the site. Run: npm run test:opportunity-email
import assert from "node:assert/strict";
import { renderOutreachEmail } from "../functions/_lib/email.ts";
import { onRequestPost as emailContact } from "../functions/api/opportunities/email.ts";

const env = { RESEND_API_KEY: "re_test", NOTIFY_FROM_EMAIL: "HVACHelp <onboarding@resend.dev>", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "pub", VITE_SITE_URL: "https://site.test" };
const LISTING = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

// ---- the email itself
const mail = renderOutreachEmail({ business_name: "Cool <b>Air</b>", recipient_name: "Dan", subject: "About permit <1>", body: "Hi Dan,\nWe can <script>x</script> help.", contactUrl: "https://site.test/contact" });
assert.equal(mail.subject, "About permit <1>");
assert.ok(mail.html.includes("Hi Dan,\nWe can &lt;script&gt;x&lt;/script&gt; help."), "the message is escaped");
assert.ok(!mail.html.includes("<script>") && !mail.html.includes("<b>Air</b>"));
assert.ok(mail.text.startsWith("Hi Dan,\nWe can <script>x</script> help.") && mail.text.includes("--"));
for (const part of ["Sent by Cool <b>Air</b> through HVACHelp", "Reply to this email to answer", "https://site.test/contact", "let us know"]) assert.ok(mail.text.includes(part), `the footer says: ${part}`);
assert.ok(mail.html.includes('<a href="https://site.test/contact"'), "the opt-out link is clickable");
assert.equal(renderOutreachEmail({ business_name: "A", recipient_name: "", subject: "  ", body: "b", contactUrl: "https://s/contact" }).subject, "A message from A", "a blank subject falls back");
assert.ok(!/[\r\n]/.test(renderOutreachEmail({ business_name: "A", recipient_name: "", subject: "x\r\nBcc: evil@x.com", body: "b", contactUrl: "https://s" }).subject), "no header injection");

// ---- the endpoint
let state, log, resend;
const reset = () => {
  state = {
    owner: [{ listing_id: LISTING }],
    target: [{ unlocked: true, to_email: "dan@d3.com", to_name: "Dan Anderson", optout: false, sent_to_today: 0, sent_total_today: 0 }],
    listing: [{ business_name: "Cool Air Houston", email: "hello@coolair.com" }],
    resendOk: true,
  };
  log = [];
  resend = [];
};
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  log.push({ url, body: init.body });
  if (url.endsWith("/auth/v1/user")) return init.headers.Authorization === "Bearer tok" ? new Response(JSON.stringify({ id: "u1", email: "owner@login.com" })) : new Response("{}", { status: 401 });
  if (url.includes("/rest/v1/listing_owners")) return new Response(JSON.stringify(state.owner));
  if (url.endsWith("/rpc/opportunity_email_target")) return new Response(JSON.stringify(state.target));
  if (url.includes("/rest/v1/listings")) return new Response(JSON.stringify(state.listing));
  if (url.endsWith("/rpc/log_opportunity_email")) return new Response("null");
  if (url === "https://api.resend.com/emails") {
    resend.push(JSON.parse(init.body));
    return state.resendOk ? new Response("{}") : new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 });
  }
  throw new Error("unexpected " + url);
};
const call = async (body, e = env, token = "tok") => {
  const r = await emailContact({ env: e, request: new Request("https://site.test/api/opportunities/email", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
};
const ok = { kind: "permit", itemId: ITEM, index: 0, subject: "About your permit", body: "Hi Dan, I would like to talk about the job." };
const logged = () => log.filter((l) => l.url.endsWith("/rpc/log_opportunity_email")).map((l) => JSON.parse(l.body));

reset();
assert.equal((await call(ok, env, "")).status, 401, "not signed in");
assert.equal((await call(ok, { ...env, RESEND_API_KEY: undefined })).status, 501, "email not set up");
state.owner = [];
assert.equal((await call(ok)).status, 403, "no approved listing");
reset();
for (const bad of [{ ...ok, kind: "other" }, { ...ok, itemId: "nope" }, { ...ok, index: -1 }, { ...ok, index: 1.5 }, { ...ok, index: 99 }, { ...ok, subject: "" }, { ...ok, subject: "x".repeat(151) }, { ...ok, body: "  " }, { ...ok, body: "x".repeat(2001) }]) {
  assert.equal((await call(bad)).status, 400, JSON.stringify(bad).slice(0, 60));
}
assert.equal(resend.length, 0, "nothing sent for a bad request");

state.target[0].unlocked = false;
let r = await call(ok);
assert.deepEqual([r.status, r.data.error], [403, "Unlock this lead first"], "the lead must be paid for first");
reset(); state.target[0].to_email = null;
assert.equal((await call(ok)).status, 404, "a contact with no address");
reset(); state.target[0].optout = true;
r = await call(ok);
assert.equal(r.status, 403);
assert.match(r.data.error, /asked not to be emailed/, "an address on the opt-out list is never emailed");
reset(); state.target[0].sent_to_today = 2;
r = await call(ok);
assert.equal(r.status, 429);
assert.match(r.data.error, /already emailed this contact 2 times today/);
reset(); state.target[0].sent_total_today = 20;
assert.equal((await call(ok)).status, 429, "a business has a daily limit too");
reset(); state.target[0].sent_to_today = 1; state.target[0].sent_total_today = 19;
assert.equal((await call(ok)).status, 200, "just under both limits still sends");
assert.equal(resend.length, 0 + 1);
assert.equal(log.some((l) => l.url.endsWith("/rpc/opportunity_email_target")), true);

reset();
r = await call({ ...ok, to: "someone-else@evil.com", email: "someone-else@evil.com", kind: "bid", index: 1 });
assert.deepEqual(r.data, { sent: true, to: "Dan Anderson" });
assert.deepEqual(JSON.parse(log.find((l) => l.url.endsWith("/rpc/opportunity_email_target")).body), { p_kind: "bid", p_item: ITEM, p_listing: LISTING, p_index: 1 }, "the browser names the contact by position only");
assert.deepEqual(resend[0].to, ["dan@d3.com"], "the address comes from the lead, never from the browser");
assert.equal(resend[0].from, "Cool Air Houston via HVACHelp <onboarding@resend.dev>");
assert.deepEqual(resend[0].reply_to, ["hello@coolair.com"], "replies go straight to the business");
assert.equal(resend[0].subject, "About your permit");
assert.ok(resend[0].html.includes("Hi Dan, I would like to talk about the job.") && resend[0].html.includes("https://site.test/contact"));
assert.deepEqual(logged(), [{ p_listing: LISTING, p_kind: "bid", p_item: ITEM, p_to: "dan@d3.com", p_subject: "About your permit", p_body: ok.body, p_error: null }], "every email is logged");

reset(); state.listing[0].email = null;
await call(ok);
assert.deepEqual(resend[0].reply_to, ["owner@login.com"], "with no public email it uses the email the business signs in with");

reset(); state.resendOk = false;
r = await call(ok);
assert.equal(r.status, 502);
assert.equal(r.data.detail, "Resend 403: Domain not verified", "the reason is passed on for the site owner");
assert.equal(logged()[0].p_error, "Resend 403: Domain not verified", "a failed send is logged with the reason (and does not count toward the limits)");

console.log("opportunity email: all checks passed");
