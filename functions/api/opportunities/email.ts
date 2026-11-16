// POST /api/opportunities/email  { kind: "permit" | "bid", itemId, index, subject, body }  (Authorization: Bearer <Supabase access token>)
// Sends an email, through the site, from a business to the contact on a building permit (the contractor) or a government bid (the contracting
// officer). The browser says WHICH contact (index) and never an address: the address is read here, from the lead itself. Rules:
//   - the business must have paid to unlock that lead;
//   - at most 2 emails to the same address from one business per day, and 20 per business per day;
//   - never to an address on the opt-out list (public.email_optouts).
// The email goes out From "<Business> via HVACHelp" with Reply-To set to the business, so the answer goes straight to them.
// Without the email settings it answers 501.
import { renderOutreachEmail, sendEmail } from "../../_lib/email";
import { db, getUser, json, ownedListingId, siteOrigin, type Env } from "../../_lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT_PER_CONTACT = 2;
const LIMIT_PER_DAY = 20;

interface Target {
  unlocked: boolean;
  to_email: string | null;
  to_name: string | null;
  optout: boolean;
  sent_to_today: number;
  sent_total_today: number;
}

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Email is not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const input = (await request.json().catch(() => ({}))) as { kind?: unknown; itemId?: unknown; index?: unknown; subject?: unknown; body?: unknown };
  const kind = input.kind === "permit" || input.kind === "bid" ? input.kind : null;
  const index = Number(input.index);
  const subject = typeof input.subject === "string" ? input.subject.replace(/[\r\n\t]+/g, " ").trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!kind || typeof input.itemId !== "string" || !UUID.test(input.itemId) || !Number.isInteger(index) || index < 0 || index > 20) return json({ error: "Unknown contact" }, 400);
  if (subject.length < 1 || subject.length > 150) return json({ error: "A subject is 1 to 150 characters" }, 400);
  if (body.length < 1 || body.length > 2000) return json({ error: "A message is 1 to 2000 characters" }, 400);

  const targetRes = await db(env, "rpc/opportunity_email_target", { method: "POST", body: JSON.stringify({ p_kind: kind, p_item: input.itemId, p_listing: listingId, p_index: index }) });
  if (!targetRes.ok) return json({ error: "Could not check the contact" }, 502);
  const target = ((await targetRes.json()) as Target[])[0];
  if (!target?.unlocked) return json({ error: "Unlock this lead first" }, 403);
  if (!target.to_email) return json({ error: "That contact has no email address" }, 404);
  if (target.optout) return json({ error: "This contact has asked not to be emailed through the site." }, 403);
  if (target.sent_to_today >= LIMIT_PER_CONTACT) return json({ error: `You have already emailed this contact ${LIMIT_PER_CONTACT} times today. Please wait until tomorrow.` }, 429);
  if (target.sent_total_today >= LIMIT_PER_DAY) return json({ error: `You have reached ${LIMIT_PER_DAY} emails for today. Please try again tomorrow.` }, 429);

  const listingRes = await db(env, `listings?id=eq.${encodeURIComponent(listingId)}&select=business_name,email&limit=1`);
  const listing = listingRes.ok ? ((await listingRes.json()) as { business_name: string; email: string | null }[])[0] : undefined;
  if (!listing) return json({ error: "Could not read your business" }, 502);

  const mail = renderOutreachEmail({ business_name: listing.business_name, recipient_name: target.to_name ?? "", subject, body, contactUrl: `${siteOrigin(env, request)}/contact` });
  const log = (error?: string) =>
    db(env, "rpc/log_opportunity_email", { method: "POST", body: JSON.stringify({ p_listing: listingId, p_kind: kind, p_item: input.itemId, p_to: target.to_email, p_subject: subject, p_body: body, p_error: error ?? null }) });
  try {
    // The business's own public email when it has one, otherwise the email it signs in with: the contact answers the business directly.
    await sendEmail(env, { to: target.to_email, fromName: `${listing.business_name} via HVACHelp`, replyTo: listing.email || user.email || undefined, ...mail });
  } catch (e) {
    await log(e instanceof Error ? e.message : "send failed");
    return json({ error: "The email could not be sent. Please try again." }, 502);
  }
  await log();
  return json({ sent: true, to: target.to_name ?? target.to_email });
};
