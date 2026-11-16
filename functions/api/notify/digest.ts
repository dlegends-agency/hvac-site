// POST /api/notify/digest   (header: X-Notify-Secret)
// Emails contractors a summary of the new building permits and government bids that reached their business. Called once a day by the
// "Opportunity alerts" GitHub workflow after the scrapes, which first asks the database to queue the summaries. Safe to call at any
// time: pending summaries are claimed in the database, so two calls never send the same email twice.
import { renderDigestEmail, secretsMatch, sendEmail, type DigestAlert } from "../../_lib/email";
import { db, json, siteOrigin, type Env } from "../../_lib/stripe";

interface Claimed extends DigestAlert {
  id: string;
  email: string;
}

// Cloudflare allows 50 outgoing requests per call: 1 claim + one send per email + 1 finish.
const BATCH = 25;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.NOTIFY_SECRET || !env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Email alerts are not configured" }, 501);
  }
  if (!secretsMatch(request.headers.get("X-Notify-Secret"), env.NOTIFY_SECRET)) return json({ error: "Forbidden" }, 403);

  const claim = await db(env, "rpc/claim_opportunity_digests", { method: "POST", body: JSON.stringify({ p_limit: BATCH }) });
  if (!claim.ok) return json({ error: "Could not read pending summaries" }, 502);
  const rows = (await claim.json()) as Claimed[];

  const site = siteOrigin(env, request);
  const sent: string[] = [];
  const failed: Record<string, string> = {};
  for (const row of rows) {
    try {
      await sendEmail(env, { to: row.email, ...renderDigestEmail(row, site) });
      sent.push(row.id);
    } catch (e) {
      failed[row.id] = e instanceof Error ? e.message : "send failed";
    }
  }

  if (rows.length > 0) {
    const finish = await db(env, "rpc/finish_opportunity_digests", { method: "POST", body: JSON.stringify({ p_sent: sent, p_failed: failed }) });
    if (!finish.ok) return json({ error: "Sent, but could not record it" }, 502);
  }
  return json({ sent: sent.length, failed: Object.keys(failed).length, more: rows.length === BATCH });
};
