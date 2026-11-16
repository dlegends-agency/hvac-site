// POST /api/messages/email  { messageId }  (Authorization: Bearer <Supabase access token>)
// Emails the customer a message that a business has just sent through the site, using the site's own email sender (Resend). The message is
// already saved in the customer's dashboard by the database function send_message; this adds the email. The browser never says who to
// email: the customer's address is read on the server from the request the message belongs to. Rules:
//   - the caller must be the signed-in owner of the business that sent the message, and the message must be from the business;
//   - it must be recent (15 minutes), so an old message cannot be re-sent, and it is emailed at most once.
// Without the email settings (RESEND_API_KEY, NOTIFY_FROM_EMAIL, SUPABASE_SERVICE_ROLE_KEY) it answers 501 and the message simply stays
// in the customer's dashboard.
import { renderMessageEmail, sendEmail } from "../../_lib/email";
import { db, getUser, json, ownedListingId, siteOrigin, type Env } from "../../_lib/stripe";

interface Info {
  id: number;
  lead_id: string;
  listing_id: string;
  sender: string;
  body: string;
  created_at: string;
  emailed_at: string | null;
  customer_email: string | null;
  customer_name: string | null;
  issue: string;
  business_name: string;
}

const FRESH_MS = 15 * 60_000;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Email is not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const body = (await request.json().catch(() => ({}))) as { messageId?: unknown };
  const messageId = Number(body.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return json({ error: "Unknown message" }, 400);

  const res = await db(env, "rpc/message_email_info", { method: "POST", body: JSON.stringify({ p_message: messageId }) });
  if (!res.ok) return json({ error: "Could not read the message" }, 502);
  const info = ((await res.json()) as Info[])[0];
  if (!info || info.listing_id !== listingId || info.sender !== "business") return json({ error: "That message was not found" }, 404);
  if (info.emailed_at) return json({ emailed: true, already: true });
  if (Date.now() - new Date(info.created_at).getTime() > FRESH_MS) return json({ error: "That message is too old to email" }, 409);
  if (!info.customer_email) return json({ emailed: false, reason: "The customer has no email address on file" });

  const link = `${siteOrigin(env, request)}/account/messages?lead=${encodeURIComponent(info.lead_id)}&listing=${encodeURIComponent(info.listing_id)}`;
  try {
    await sendEmail(env, { to: info.customer_email, ...renderMessageEmail({ business_name: info.business_name, customer_name: info.customer_name ?? "", issue: info.issue, body: info.body }, link) });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "send failed";
    await db(env, "rpc/mark_message_emailed", { method: "POST", body: JSON.stringify({ p_message: messageId, p_error: reason }) });
    return json({ emailed: false, reason: "The email could not be sent" });
  }
  await db(env, "rpc/mark_message_emailed", { method: "POST", body: JSON.stringify({ p_message: messageId }) });
  return json({ emailed: true });
};
