// Customer recommendations for directory listings: validation, the emailed confirmation token and the confirmation email.
// A recommendation is saved first; the business then decides whether to show it. The email confirmation is an extra note on it.
import { escapeHtml } from "./email";

export interface RecommendationInput {
  slug: string;
  name: string;
  email: string;
  body: string;
  /** The customer ticked "I have used this business". */
  used: boolean;
}

export const BODY_MIN = 20;
export const BODY_MAX = 1000;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@<>"',;:%]+@[^\s@<>"',;:%]+\.[^\s@<>"',;:%]{2,}$/;
const NAME = /^\p{L}[\p{L}'’.\- ]{1,59}$/u;

/**
 * The name shown next to a recommendation: first name and last initial ("Maria Lopez-Diaz" becomes "Maria L."),
 * so the full name of a customer is never published. Null when it does not look like a person's name.
 */
export function displayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!NAME.test(name)) return null;
  const words = name.split(" ").filter(Boolean);
  const first = words[0].replace(/[.\-']+$/g, "");
  if ([...first].length < 2) return null;
  if (words.length === 1) return first;
  const last = [...words[words.length - 1]].find((c) => /\p{L}/u.test(c));
  return last ? `${first} ${last.toUpperCase()}.` : first;
}

export type Checked = { ok: true; value: RecommendationInput & { shownName: string } } | { ok: false; error: string };

/** Checks what the form sent. The message is safe to show to the customer. */
export function checkRecommendation(raw: unknown): Checked {
  const r = (raw ?? {}) as Record<string, unknown>;
  const slug = typeof r.slug === "string" ? r.slug : "";
  const name = typeof r.name === "string" ? r.name : "";
  const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
  const body = typeof r.body === "string" ? r.body.replace(/\r\n/g, "\n").trim() : "";
  if (!SLUG.test(slug) || slug.length > 120) return { ok: false, error: "That business could not be found." };
  const shownName = displayName(name);
  if (!shownName) return { ok: false, error: "Enter your first name and last name." };
  if (email.length > 200 || !EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (r.used !== true) return { ok: false, error: "Please confirm that you have used this business." };
  if (body.length < BODY_MIN) return { ok: false, error: `Write at least ${BODY_MIN} characters about your experience.` };
  if (body.length > BODY_MAX) return { ok: false, error: `Keep it under ${BODY_MAX} characters.` };
  if (/https?:\/\/|www\.|\S+@\S+\.\S+/i.test(body)) return { ok: false, error: "Please leave out links and email addresses." };
  return { ok: true, value: { slug, name, email, body, used: true, shownName } };
}

const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A random token for the confirmation link (64 hex characters). Only its hash is stored. */
export function newToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Salted SHA-256 of a sender's network address, used only to limit how many recommendations one sender can post. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  return hashToken(`${salt}:${ip}`);
}

export const isToken = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

/** Single-line text from a user or listing field, for the subject line. */
const oneLine = (s: string, max: number) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

export function renderConfirmEmail(businessName: string, link: string): { subject: string; html: string; text: string } {
  const name = oneLine(businessName, 120);
  const subject = `Confirm your recommendation of ${name}`;
  const text = [
    `Thanks for recommending ${name} on HVACHelp.`,
    "",
    `Please confirm your email address by opening this link: ${link}`,
    "",
    "After you confirm, the business reads your recommendation and decides whether to show it on its page. Your email address is never shown.",
    "If you did not write this, ignore this email and nothing will be published.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#14213d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px"><tr><td>
<h1 style="margin:0 0 16px;font-size:22px">Confirm your recommendation</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Thanks for recommending <strong>${escapeHtml(name)}</strong> on HVACHelp. Please confirm your email address.</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Confirm my email</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#64748b">After you confirm, the business reads your recommendation and decides whether to show it on its page. Your email address is never shown. If you did not write this, ignore this email and nothing will be published.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
