import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useCaptcha } from "@/components/ui/Turnstile";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useAccount } from "./account-context";

type Note = { ok: boolean; text: string } | null;

const note = (n: Note) => <p role="status" className={`mt-3 text-sm font-medium ${n?.ok ? "text-green-700" : "text-red-700"}`}>{n?.text}</p>;

function Details() {
  const { name, phone, email, refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState<Note>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("full_name") ?? "").trim().slice(0, 120);
    const tel = String(f.get("phone") ?? "").trim().slice(0, 40);
    if (tel && !/^[\d\s()+.-]{7,40}$/.test(tel)) return setN({ ok: false, text: "Enter a valid phone number, or leave it empty." });
    setBusy(true);
    setN(null);
    const { error } = await getSupabaseBrowser().auth.updateUser({ data: { full_name, phone: tel } });
    setBusy(false);
    if (error) return setN({ ok: false, text: "We couldn't save that. Please try again." });
    await refresh();
    setN({ ok: true, text: "Saved." });
  }

  return (
    <Panel title="Your details">
      <form onSubmit={save} noValidate className="space-y-3" key={`${name}|${phone}`}>
        <p className="text-sm text-slate-700">Signed in as <strong>{email}</strong></p>
        <Field id="full_name" label="Your name" hint="Businesses you write to see this name.">
          {(a) => <input id="full_name" name="full_name" defaultValue={name} maxLength={120} autoComplete="name" className={inputClass} {...a} />}
        </Field>
        <Field id="phone" label="Phone number" hint="Optional. Kept private. It is not shown to businesses.">
          {(a) => <input id="phone" name="phone" type="tel" defaultValue={phone} maxLength={40} autoComplete="tel" className={inputClass} {...a} />}
        </Field>
        <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save details</Button>
        {note(n)}
      </form>
    </Panel>
  );
}

function SignIn() {
  const { email } = useAccount();
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
    const { error } = await getSupabaseBrowser().auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/account/settings` });
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

/** The customer's own details and sign-in settings. */
export default function AccountSettings() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Details />
      <SignIn />
    </div>
  );
}
