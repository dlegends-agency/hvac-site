// New-lead alert emails. The email is a heads-up with a link to the dashboard: it names the problem only. The customer's name,
// phone, email and address are never put in an email (contractors unlock them in the dashboard).
import type { Env } from "./stripe";

export interface LeadAlert {
  business_name: string;
  issue: string;
  urgency: string;
  city: string;
  state: string;
  lead_created_at: string;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Constant-time string comparison for the shared secret. */
export function secretsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Single-line, length-limited text from user-supplied fields (used in the subject line). */
const oneLine = (s: string, max: number) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

export function renderLeadEmail(a: LeadAlert, siteUrl: string): { subject: string; html: string; text: string } {
  const urgent = a.urgency === "Immediately";
  const issue = oneLine(a.issue, 200);
  const link = `${siteUrl}/contractor/leads?status=new`;
  const settings = `${siteUrl}/contractor`;
  const when = new Date(a.lead_created_at).toUTCString();
  const subject = `${urgent ? "Urgent: " : ""}New HVAC request: ${issue}`;

  const text = [
    `Hi ${oneLine(a.business_name, 120)},`,
    "",
    "A customer near you just asked for HVAC help.",
    `Problem: ${issue}`,
    `Received: ${when}`,
    "",
    "This request may also have been sent to other contractors, so a quick reply helps.",
    `Open your dashboard to see who it is and unlock their contact details: ${link}`,
    "",
    `You get this email because your business is listed in our directory. You can turn these emails off in your dashboard: ${settings}`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:13px;color:${urgent ? "#c2410c" : "#2563eb"};font-weight:bold">${urgent ? "NEEDS HELP NOW" : "NEW CUSTOMER REQUEST"}</p>
<h1 style="margin:0 0 16px;font-size:22px">A customer near you needs HVAC help</h1>
<p style="margin:0 0 6px;font-size:15px"><strong>Problem:</strong> ${escapeHtml(issue)}</p>
<p style="margin:0 0 20px;font-size:13px;color:#64748b">Received ${escapeHtml(when)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">This request may also have been sent to other contractors, so a quick reply helps. Open your dashboard to see who it is and unlock their contact details.</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">View the request</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#64748b">You get this email because ${escapeHtml(oneLine(a.business_name, 120))} is listed in our directory. You can <a href="${escapeHtml(settings)}" style="color:#2563eb">turn these emails off in your dashboard</a>.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, html, text };
}

/** Sends one email through Resend (https://resend.com). Throws with a short reason when it fails. */
export async function sendEmail(env: Env, msg: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.NOTIFY_FROM_EMAIL, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "";
    throw new Error(`Resend ${res.status}${detail ? `: ${detail}` : ""}`);
  }
}
