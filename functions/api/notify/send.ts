// POST /api/notify/send   (header: X-Notify-Secret)
// Emails contractors about leads that were sent to them. Called by the database right after a lead is assigned, and every few
// minutes by a scheduled GitHub workflow as a safety net. Safe to call at any time: pending alerts are claimed in the database,
// so two calls never send the same email twice.
import { renderLeadEmail, secretsMatch, sendEmail, type LeadAlert } from "../../_lib/email";
import { db, json, siteOrigin, type Env } from "../../_lib/stripe";

interface Claimed extends LeadAlert {
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

  const claim = await db(env, "rpc/claim_lead_notifications", { method: "POST", body: JSON.stringify({ p_limit: BATCH }) });
  if (!claim.ok) return json({ error: "Could not read pending alerts" }, 502);
  const rows = (await claim.json()) as Claimed[];

  const site = siteOrigin(env, request);
  const sent: string[] = [];
  const failed: Record<string, string> = {};
  for (const row of rows) {
    try {
      await sendEmail(env, { to: row.email, ...renderLeadEmail(row, site) });
      sent.push(row.id);
    } catch (e) {
      failed[row.id] = e instanceof Error ? e.message : "send failed";
    }
  }

  if (rows.length > 0) {
    const finish = await db(env, "rpc/finish_lead_notifications", { method: "POST", body: JSON.stringify({ p_sent: sent, p_failed: failed }) });
    if (!finish.ok) return json({ error: "Sent, but could not record it" }, 502);
  }
  return json({ sent: sent.length, failed: Object.keys(failed).length, more: rows.length === BATCH });
};
