import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useCaptcha } from "@/components/ui/Turnstile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle, Panel } from "./widgets";

type Note = { ok: boolean; text: string } | null;

const note = (n: Note) => <p role="status" className={`mt-3 text-sm font-medium ${n?.ok ? "text-green-700" : "text-red-700"}`}>{n?.text}</p>;

/** The admin's own name and contact details, kept with the sign-in account (user metadata), so no database change is needed. */
function Profile({ email, initial, onSaved }: { email: string; initial: { full_name: string; job_title: string; phone: string }; onSaved: (name: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("full_name") ?? "").trim().slice(0, 100);
    const job_title = String(f.get("job_title") ?? "").trim().slice(0, 100);
    const phone = String(f.get("phone") ?? "").trim().slice(0, 40);
    if (!full_name) return setMsg({ ok: false, text: "Enter your name." });
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().auth.updateUser({ data: { full_name, job_title, phone } });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "We couldn't save your details. Please try again." });
    onSaved(full_name);
    setMsg({ ok: true, text: "Saved." });
  }

  return (
    <Panel title="Your information">
      <form onSubmit={save} noValidate className="space-y-3">
        <Field id="full_name" label="Full name">
          {(a) => <input id="full_name" name="full_name" defaultValue={initial.full_name} autoComplete="name" maxLength={100} className={inputClass} {...a} />}
        </Field>
        <Field id="job_title" label="Job title" hint="Optional. For example Owner or Support.">
          {(a) => <input id="job_title" name="job_title" defaultValue={initial.job_title} maxLength={100} className={inputClass} {...a} />}
        </Field>
        <Field id="phone" label="Phone number" hint="Optional. Kept with your sign-in account.">
          {(a) => <input id="phone" name="phone" type="tel" defaultValue={initial.phone} autoComplete="tel" maxLength={40} className={inputClass} {...a} />}
        </Field>
        <p className="text-sm text-slate-600">Sign-in email: <strong>{email}</strong> (change it below).</p>
        <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save information
        </Button>
        {note(msg)}
      </form>
    </Panel>
  );
}

function SignIn({ email }: { email: string }) {
  const [emailNote, setEmailNote] = useState<Note>(null);
  const [pwNote, setPwNote] = useState<Note>(null);
  const [busy, setBusy] = useState<"email" | "password" | null>(null);
  const captcha = useCaptcha();

  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const next = String(new FormData(form).get("new_email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(next)) return setEmailNote({ ok: false, text: "Enter a valid email address." });
    if (next.toLowerCase() === email.toLowerCase()) return setEmailNote({ ok: false, text: "That is already your email address." });
    setBusy("email");
    setEmailNote(null);
    const { error } = await getSupabaseBrowser().auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/admin/account` });
    setBusy(null);
    if (error) return setEmailNote({ ok: false, text: "We couldn't change your email. It may already be in use." });
    form.reset();
    setEmailNote({ ok: true, text: `We sent a confirmation link to ${next}. Your sign-in email changes after you click it. Until then, keep using ${email}.` });
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const current = String(f.get("current_password") ?? "");
    const next = String(f.get("new_password") ?? "");
    const again = String(f.get("confirm_password") ?? "");
    if (!current) return setPwNote({ ok: false, text: "Enter your current password." });
    if (next.length < 8) return setPwNote({ ok: false, text: "Use a new password of at least 8 characters." });
    if (next === current) return setPwNote({ ok: false, text: "Choose a password different from your current one." });
    if (next !== again) return setPwNote({ ok: false, text: "The new passwords don't match." });
    setBusy("password");
    setPwNote(null);
    const auth = getSupabaseBrowser().auth;
    const check = await auth.signInWithPassword({ email, password: current, options: { captchaToken: captcha.token ?? undefined } });
    captcha.reset();
    if (check.error) {
      setBusy(null);
      return setPwNote({ ok: false, text: "Your current password is not correct." });
    }
    const { error } = await auth.updateUser({ password: next });
    setBusy(null);
    if (error) return setPwNote({ ok: false, text: "We couldn't change your password. Please try again." });
    form.reset();
    setPwNote({ ok: true, text: "Password changed." });
  }

  return (
    <Panel title="Sign-in details">
      <form onSubmit={changeEmail} noValidate className="space-y-3">
        <Field id="new_email" label="New email address" hint="We email a confirmation link to the new address before anything changes.">
          {(a) => <input id="new_email" name="new_email" type="email" autoComplete="email" className={inputClass} {...a} />}
        </Field>
        <Button type="submit" variant="secondary" disabled={busy !== null} className="!rounded-full !px-5 !py-2 text-sm">
          {busy === "email" && <Loader2 className="size-4 animate-spin" aria-hidden />} Change email
        </Button>
        {note(emailNote)}
      </form>

      <hr className="my-6 border-slate-100" />

      <form onSubmit={changePassword} noValidate className="space-y-3">
        <h3 className="font-semibold text-navy">Change password</h3>
        <Field id="current_password" label="Current password">
          {(a) => <input id="current_password" name="current_password" type="password" autoComplete="current-password" className={inputClass} {...a} />}
        </Field>
        <Field id="new_password" label="New password" hint="At least 8 characters.">
          {(a) => <input id="new_password" name="new_password" type="password" autoComplete="new-password" className={inputClass} {...a} />}
        </Field>
        <Field id="confirm_password" label="Confirm new password">
          {(a) => <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" className={inputClass} {...a} />}
        </Field>
        {captcha.widget}
        <Button type="submit" variant="secondary" disabled={busy !== null || captcha.blocked} className="!rounded-full !px-5 !py-2 text-sm">
          {busy === "password" && <Loader2 className="size-4 animate-spin" aria-hidden />} Change password
        </Button>
        {note(pwNote)}
      </form>
    </Panel>
  );
}

/** Signs this account out on every other browser and device (this one stays signed in). */
function Sessions() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note>(null);
  async function signOutOthers() {
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().auth.signOut({ scope: "others" });
    setBusy(false);
    setMsg(error ? { ok: false, text: "We couldn't do that. Please try again." } : { ok: true, text: "Every other device has been signed out." });
  }
  return (
    <Panel title="Sessions">
      <p className="text-sm text-slate-700">Signed in somewhere you no longer use, or changed your password after a worry? Sign out everywhere else. This browser stays signed in.</p>
      <Button type="button" variant="secondary" onClick={signOutOthers} disabled={busy} className="mt-3 !rounded-full !px-5 !py-2 text-sm">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />} Sign out other devices
      </Button>
      {note(msg)}
    </Panel>
  );
}

export function AdminAccount() {
  const [user, setUser] = useState<{ email: string; full_name: string; job_title: string; phone: string } | null>(null);
  useEffect(() => {
    void getSupabaseBrowser().auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const m = (u.user_metadata ?? {}) as Record<string, unknown>;
      const text = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : "");
      setUser({ email: u.email ?? "", full_name: text("full_name"), job_title: text("job_title"), phone: text("phone") });
    });
  }, []);

  return (
    <>
      <PageTitle title="Account settings" description="Your name and contact details, your sign-in email and your password." />
      {!user ? (
        <p className="text-slate-600">Loading…</p>
      ) : (
        <div className="grid w-full items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Profile email={user.email} initial={user} onSaved={(full_name) => setUser((u) => (u ? { ...u, full_name } : u))} />
          <SignIn email={user.email} />
          <Sessions />
        </div>
      )}
    </>
  );
}
