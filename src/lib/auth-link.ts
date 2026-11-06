// When someone opens the link in a sign-up or password email, Supabase sends them back to the site. If the link is bad (expired, already
// used, or opened first by an email security scanner) it adds the problem to the address after a "#", for example
// "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired". This reads that and explains it.

export interface AuthLinkError {
  code: string;
  description: string;
}

/** The problem in a "#..." address fragment, or null when the fragment is not an error. */
export function parseAuthLinkError(hash: string): AuthLinkError | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error_code") ?? params.get("error");
  if (!code) return null;
  return { code: code.slice(0, 60), description: (params.get("error_description") ?? "").slice(0, 200) };
}

/** What to tell the person, in plain words. */
export function authLinkMessage(e: AuthLinkError): string {
  if (e.code === "otp_expired" || e.code === "access_denied") {
    return "That email link is not valid any more. It may have expired or already been used (some email programs open links automatically, which uses them up). If you already opened it once, your email may be confirmed, so try signing in. Otherwise send yourself a new link below.";
  }
  return `That email link did not work${e.description ? `: ${e.description}` : ""}. You can send yourself a new link below.`;
}

const KEY = "hvachelp-auth-link-error";

export function rememberAuthLinkError(e: AuthLinkError): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(e));
  } catch {
    /* storage can be blocked; the person just sees the plain sign-in page */
  }
}

/** The remembered problem, or null. Reading does not remove it, so a page that renders twice still shows it; call forgetAuthLinkError once it is shown. */
export function peekAuthLinkError(): AuthLinkError | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as AuthLinkError;
    return typeof v.code === "string" ? v : null;
  } catch {
    return null;
  }
}

export function forgetAuthLinkError(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
