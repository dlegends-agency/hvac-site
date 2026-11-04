import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useCaptcha } from "@/components/ui/Turnstile";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { usePageMeta } from "@/lib/use-page-meta";

type Mode = "signin" | "signup" | "reset";

type Audience = "contractor" | "customer";

/** The same page serves both kinds of account: contractors (business dashboard) and customers (follow your requests). */
export function AuthPage({ audience }: { audience: Audience }) {
  const customer = audience === "customer";
  usePageMeta({ title: `${customer ? "Sign in to follow your requests" : "Contractor sign in"} | HVACHelp`, noindex: true });
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const captcha = useCaptcha();
  const plan = customer ? null : params.get("plan");
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const after = customer ? "/account" : plan === "featured" ? `/contractor/billing?plan=featured&interval=${params.get("interval") === "month" ? "month" : "year"}` : "/contractor";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password") ?? "");
    setBusy(true);
    setError(null);
    setNotice(null);
    const auth = getSupabaseBrowser().auth;

    if (mode === "reset") {
      await auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${after}`, captchaToken: captcha.token ?? undefined });
      captcha.reset();
      setBusy(false);
      return setNotice("If an account exists for that email, we've sent a link to reset the password.");
    }
    if (mode === "signup") {
      if (password.length < 8) {
        setBusy(false);
        return setError("Use a password of at least 8 characters.");
      }
      const { data: res, error: err } = await auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${after}`, captchaToken: captcha.token ?? undefined } });
      captcha.reset();
      setBusy(false);
      if (err) return setError(err.message.toLowerCase().includes("registered") ? "An account with that email already exists. Try signing in." : "We couldn't create the account. Please try again.");
      if (res.session) return navigate(after, { replace: true });
      return setNotice("Check your email and click the confirmation link, then sign in.");
    }
    const { error: err } = await auth.signInWithPassword({ email, password, options: { captchaToken: captcha.token ?? undefined } });
    captcha.reset();
    setBusy(false);
    if (err) return setError("Sign-in failed. Check your email and password.");
    navigate(after, { replace: true });
  }

  const who = customer ? "" : "contractor ";
  const title = mode === "signup" ? `Create your ${who}account` : mode === "reset" ? "Reset your password" : customer ? "Sign in to your requests" : "Contractor sign in";

  return (
    <div className="min-h-screen bg-surface">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <Link to="/" aria-label="HVACHelp home" className="mb-6 self-center"><Logo /></Link>
        <form onSubmit={onSubmit} className="w-full space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5 sm:p-8">
          <h1 className="text-2xl font-bold text-navy">{title}</h1>
          {mode === "signup" && (customer
            ? <p className="text-sm text-slate-600">Use the same email address you gave in your request. After you confirm it, your requests show up here, with the businesses that received them.</p>
            : <p className="text-sm text-slate-600">One account per business. After signing up you can claim your listing or add your business. We review every claim.</p>)}
          {mode === "signin" && customer && <p className="text-sm text-slate-600">Follow the requests you sent: which businesses received them and whether they have been in touch.</p>}
          {!isSupabaseConfigured && <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">Accounts are not available yet (Supabase is not configured).</p>}
          <Field id="email" label="Email">
            {(a) => <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} {...a} />}
          </Field>
          {mode !== "reset" && (
            <Field id="password" label="Password">
              {(a) => <input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} className={inputClass} {...a} />}
            </Field>
          )}
          <div role="alert">{error && <p className="text-sm font-medium text-red-700">{error}</p>}</div>
          {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
          {captcha.widget}
          <Button type="submit" className="w-full" disabled={busy || captcha.blocked || !isSupabaseConfigured}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            {mode === "signin" ? (
              <>
                <button type="button" onClick={() => { setMode("signup"); setError(null); setNotice(null); }} className="font-semibold text-primary hover:underline">Create an account</button>
                <button type="button" onClick={() => { setMode("reset"); setError(null); setNotice(null); }} className="text-slate-600 hover:underline">Forgot password?</button>
              </>
            ) : (
              <button type="button" onClick={() => { setMode("signin"); setError(null); setNotice(null); }} className="font-semibold text-primary hover:underline">Back to sign in</button>
            )}
          </div>
        </form>
        {customer ? (
          <p className="mt-5 text-center text-sm text-slate-600">Need HVAC help? <Link to="/#request" className="font-semibold text-primary hover:underline">Send a request</Link>. Are you a contractor? <Link to="/contractor/login" className="font-semibold text-primary hover:underline">Contractor sign in</Link>.</p>
        ) : (
          <p className="mt-5 text-center text-sm text-slate-600">New here? See <Link to="/pricing" className="font-semibold text-primary hover:underline">plans and pricing</Link>. Looking for a contractor? <Link to="/account/login" className="font-semibold text-primary hover:underline">Follow your requests</Link>.</p>
        )}
      </main>
    </div>
  );
}

export default function ContractorLoginPage() {
  return <AuthPage audience="contractor" />;
}
