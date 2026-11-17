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
export async function sendEmail(env: Env, msg: { to: string; subject: string; html: string; text: string; fromName?: string; replyTo?: string }): Promise<void> {
  // The site's own address always sends; fromName only changes the display name (for example "Cool Air Houston via HVACHelp").
  const address = /<([^>]+)>/.exec(env.NOTIFY_FROM_EMAIL ?? "")?.[1] ?? env.NOTIFY_FROM_EMAIL;
  const from = msg.fromName ? `${msg.fromName.replace(/["<>,;\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)} <${address}>` : env.NOTIFY_FROM_EMAIL;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(msg.replyTo ? { reply_to: [msg.replyTo] } : {}) }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "";
    throw new Error(`Resend ${res.status}${detail ? `: ${detail}` : ""}`);
  }
}

export interface DigestAlert {
  business_name: string;
  permits: number;
  bids: number;
  /** Up to three of the newest: a short title and the city. Public notice text only, never a phone number or an email address. */
  highlights: { kind: "permit" | "bid"; title: string; city: string | null }[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The daily summary of new building permits and government bids that reached a business. A heads-up with a link; contacts stay locked. */
export function renderDigestEmail(a: DigestAlert, siteUrl: string): { subject: string; html: string; text: string } {
  const parts = [a.bids > 0 ? plural(a.bids, "government bid", "government bids") : "", a.permits > 0 ? plural(a.permits, "building permit", "building permits") : ""].filter(Boolean);
  const what = parts.join(" and ");
  const link = `${siteUrl}/contractor/opportunities${a.bids === 0 && a.permits > 0 ? "?tab=permits" : ""}`;
  const settings = `${siteUrl}/contractor`;
  const subject = `New near you: ${what}`;
  const items = (a.highlights ?? []).slice(0, 3).map((h) => ({ kind: h.kind === "bid" ? "Government bid" : "Building permit", title: oneLine(h.title, 140), city: h.city ? oneLine(h.city, 60) : "" }));

  const text = [
    `Hi ${oneLine(a.business_name, 120)},`,
    "",
    `New work reached your business since your last summary: ${what}.`,
    ...(items.length ? ["", ...items.map((i) => `- ${i.kind}: ${i.title}${i.city ? ` (${i.city})` : ""}`)] : []),
    "",
    `You can see everything about each one in your dashboard. The phone number and email unlock for a one-time payment per lead: ${link}`,
    "",
    `You get this email because your business is listed in our directory. You can turn these emails off in your dashboard: ${settings}`,
  ].join("\n");

  const list = items.length
    ? `<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.6">${items.map((i) => `<li><strong>${escapeHtml(i.kind)}:</strong> ${escapeHtml(i.title)}${i.city ? ` <span style="color:#64748b">(${escapeHtml(i.city)})</span>` : ""}</li>`).join("")}</ul>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:13px;color:#059669;font-weight:bold">NEW OPPORTUNITIES NEAR YOU</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(what)} reached your business</h1>
${list}<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Open your dashboard to see everything about each one. The phone number and email unlock for a one-time payment per lead.</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">See the opportunities</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#64748b">You get this email because ${escapeHtml(oneLine(a.business_name, 120))} is listed in our directory. You can <a href="${escapeHtml(settings)}" style="color:#2563eb">turn these emails off in your dashboard</a>.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, html, text };
}

export interface MessageEmail {
  business_name: string;
  customer_name: string;
  issue: string;
  body: string;
  /** What the business wrote on the subject line. A default is used when it is empty. */
  subject?: string | null;
}

/**
 * The email a customer gets when a business sends them a message through the site. It carries the message itself and a link to read and
 * reply in their HVACHelp dashboard. It never contains the business's phone number or email address: replies stay on the site.
 */
export function renderMessageEmail(a: MessageEmail, link: string): { subject: string; html: string; text: string } {
  const business = oneLine(a.business_name, 120);
  const name = oneLine(a.customer_name, 60) || "there";
  const issue = oneLine(a.issue, 160);
  const subject = oneLine(a.subject ?? "", 150) || `New message from ${business} about your HVAC request`;
  const body = a.body.trim().slice(0, 2000);

  const text = [
    `Hi ${name},`,
    "",
    `From ${business}, about your request (${issue}):`,
    "",
    body,
    "",
    `Read and reply in your HVACHelp dashboard: ${link}`,
    "Sign in with this email address, or create a free account with it, to reply. Replies are sent through the site, not by email.",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:13px;color:#2563eb;font-weight:bold">NEW MESSAGE</p>
<h1 style="margin:0 0 6px;font-size:22px">${escapeHtml(subject)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#64748b">From <strong>${escapeHtml(business)}</strong>, about your request: ${escapeHtml(issue)}</p>
<div style="margin:0 0 20px;padding:14px 16px;background:#f1f5f9;border-radius:12px;font-size:15px;line-height:1.55;white-space:pre-line">${escapeHtml(body)}</div>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Read and reply</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#64748b">Sign in with this email address, or create a free account with it, to reply. Replies are sent through the site, not by email, so your contact details stay private.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, html, text };
}

export interface OutreachEmail {
  business_name: string;
  recipient_name: string;
  subject: string;
  body: string;
  /** Where a person who does not want emails like this can say so. */
  contactUrl: string;
}

/**
 * An email a business sends, through the site, to the contact on a building permit or a government bid. It is a plain business email: the
 * subject and message the business wrote, then a short line saying who sent it, that replying answers the business directly, and how to ask
 * not to be emailed again.
 */
export function renderOutreachEmail(a: OutreachEmail): { subject: string; html: string; text: string } {
  const business = oneLine(a.business_name, 120);
  const subject = oneLine(a.subject, 150) || `A message from ${business}`;
  const body = a.body.trim().slice(0, 2000);
  const footer = `Sent by ${business} through HVACHelp, a directory of HVAC contractors. Reply to this email to answer ${business} directly. If you do not want emails like this, let us know at ${a.contactUrl} and we will stop them.`;

  const text = [body, "", "--", footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#14213d">
<div style="max-width:600px;padding:20px 16px;font-size:15px;line-height:1.55;white-space:pre-line">${escapeHtml(body)}</div>
<div style="max-width:600px;padding:0 16px 24px;font-size:12px;line-height:1.5;color:#64748b"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 12px">${escapeHtml(footer.replace(a.contactUrl, ""))}<a href="${escapeHtml(a.contactUrl)}" style="color:#2563eb">${escapeHtml(a.contactUrl)}</a></div>
</body></html>`;
  return { subject, html, text };
}

/** A report the AI Assistant writes for a business, sent to that business's own email address. Plain text in the body, with a link back to the dashboard. */
export function renderReportEmail(a: { business_name: string; subject: string; body: string }, siteUrl: string): { subject: string; html: string; text: string } {
  const business = oneLine(a.business_name, 120);
  const subject = oneLine(a.subject, 150) || `Your HVACHelp report`;
  const body = a.body.trim().slice(0, 6000);
  const link = `${siteUrl}/contractor`;
  const text = [`Hi ${business},`, "", body, "", "--", `Written by the AI Assistant in your HVACHelp dashboard. Check the details before you act on them: ${link}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
<div style="max-width:600px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border-radius:12px;padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hi ${escapeHtml(business)},</p><div style="white-space:pre-line">${escapeHtml(body)}</div></div>
<p style="font-size:12px;line-height:1.5;color:#64748b;margin:12px 4px">Written by the AI Assistant in your HVACHelp dashboard. Check the details before you act on them. <a href="${escapeHtml(link)}" style="color:#2563eb">Open your dashboard</a></p></div></body></html>`;
  return { subject, html, text };
}
