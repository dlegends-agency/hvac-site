// Cloudflare Turnstile (the CAPTCHA) checked on the server. Without TURNSTILE_SECRET_KEY the check is skipped, so the forms keep working
// until it is set up; once the secret is set, every submission needs a valid token from the widget.
import type { Env } from "./stripe";

export interface CaptchaResult {
  ok: boolean;
  /** True when no secret is configured, so nothing was checked. */
  skipped: boolean;
}

export async function verifyCaptcha(env: Env, token: unknown, ip?: string | null): Promise<CaptchaResult> {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true, skipped: true };
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) return { ok: false, skipped: false };
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    if (!res.ok) return { ok: false, skipped: false };
    return { ok: ((await res.json()) as { success?: boolean }).success === true, skipped: false };
  } catch {
    return { ok: false, skipped: false };
  }
}
