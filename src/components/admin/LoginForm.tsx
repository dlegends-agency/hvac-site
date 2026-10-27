import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export function LoginForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    const data = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    const { error } = await getSupabaseBrowser().auth.signInWithPassword({
      email: String(data.get("email")).trim(),
      password: String(data.get("password")),
    });
    if (error) {
      setError("Sign-in failed. Check your email and password.");
      setLoading(false);
      return;
    }
    navigate("/admin", { replace: true });
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5 sm:p-8">
      <h1 className="text-2xl font-bold text-navy">Admin sign in</h1>
      {!isSupabaseConfigured && (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
        </p>
      )}
      <Field id="email" label="Email">
        {(a) => <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} {...a} />}
      </Field>
      <Field id="password" label="Password">
        {(a) => <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} {...a} />}
      </Field>
      <div role="alert">{error && <p className="text-sm font-medium text-red-700">{error}</p>}</div>
      <Button type="submit" className="w-full" disabled={loading || !isSupabaseConfigured}>
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />} Sign in
      </Button>
    </form>
  );
}
