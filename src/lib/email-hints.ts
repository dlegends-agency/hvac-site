/**
 * Turns what the email service (Resend) said into a plain sentence for the site owner. Shown after "the email could not be sent", so the
 * cause (almost always a sender domain that is not verified yet) is not a mystery.
 */
export function emailFailureHint(detail: string | undefined): string {
  const d = (detail ?? "").trim();
  if (!d) return "";
  if (/testing emails|own email address|verify a domain|domain is not verified|not verified/i.test(d)) {
    return "Site owner: Resend is still in test mode, so it only delivers to the email address of your own Resend account. Verify your sending domain at resend.com/domains, set NOTIFY_FROM_EMAIL in Cloudflare to an address on that domain, then redeploy.";
  }
  if (/API key|unauthorized|401/i.test(d)) return "Site owner: the Resend API key was refused. Check RESEND_API_KEY in Cloudflare.";
  return `Site owner: the email service said: ${d}`;
}
