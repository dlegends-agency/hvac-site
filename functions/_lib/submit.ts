// Helpers for the public form endpoints (/api/submit/*): they check the CAPTCHA, keep only the fields each form is allowed to set,
// and save the row with the service role key. The browser can no longer write these tables directly once supabase/lock-direct-inserts.sql is run.
import { verifyCaptcha } from "./captcha";
import { json, type Env } from "./stripe";

/** t = text up to 300 characters, T = text up to 2000, b = true/false, u = a UUID, slug = a URL slug. A trailing ? means optional. */
export type Spec = Record<string, "t" | "t?" | "T" | "T?" | "b" | "b?" | "u" | "slug">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function pickFields(raw: unknown, spec: Spec): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(spec)) {
    const optional = kind.endsWith("?");
    const base = kind.replace("?", "");
    const v = r[key];
    if (v === undefined || v === null || v === "") {
      if (optional) continue;
      return { ok: false, error: `Missing ${key}` };
    }
    if (base === "b") {
      if (typeof v !== "boolean") return { ok: false, error: `Invalid ${key}` };
    } else {
      if (typeof v !== "string") return { ok: false, error: `Invalid ${key}` };
      const max = base === "T" ? 2000 : base === "slug" ? 120 : 300;
      if (v.length > max) return { ok: false, error: `Invalid ${key}` };
      if (base === "u" && !UUID.test(v)) return { ok: false, error: `Invalid ${key}` };
      if (base === "slug" && !SLUG.test(v)) return { ok: false, error: `Invalid ${key}` };
    }
    out[key] = v;
  }
  return { ok: true, value: out };
}

/** Reads the JSON body and checks the CAPTCHA. Returns the body, or the response to send back. */
export async function readGuarded(env: Env, request: Request): Promise<{ body: Record<string, unknown> } | { response: Response }> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_URL) return { response: json({ error: "Not available right now." }, 501) };
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { response: json({ error: "Invalid request." }, 400) };
  }
  const captcha = await verifyCaptcha(env, body.captcha, request.headers.get("CF-Connecting-IP"));
  if (!captcha.ok) return { response: json({ error: "Please complete the security check and try again.", captcha: true }, 400) };
  return { body };
}
