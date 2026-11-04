import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export interface PostResult {
  ok: boolean;
  status: number;
  /** A message that is safe to show, when the server gave one. */
  error?: string;
  /** True when the server refused the security check. */
  captcha?: boolean;
}

/**
 * Sends a public form to one of our /api/submit/* endpoints with its CAPTCHA token. When the visitor is signed in their session is
 * sent too, so the server can link the request to their account. In `npm run dev` (no server functions) it can fall back to `devFallback`.
 */
export async function postForm(
  path: string,
  body: Record<string, unknown>,
  captcha: string | null,
  opts: { devFallback?: () => Promise<boolean> } = {},
): Promise<PostResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseConfigured) {
    const { data } = await getSupabaseBrowser().auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  try {
    const res = await fetch(path, { method: "POST", headers, body: JSON.stringify({ ...body, captcha }) });
    if (res.status === 404 && import.meta.env.DEV && opts.devFallback) return { ok: await opts.devFallback(), status: 200 };
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; captcha?: boolean };
    return { ok: res.ok && j.ok === true, status: res.status, error: j.error, captcha: j.captcha };
  } catch {
    return { ok: false, status: 0 };
  }
}
