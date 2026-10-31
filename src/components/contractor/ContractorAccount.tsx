import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { planName } from "@/config/pricing";
import { useNow } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { PlanId } from "@/lib/types";
import { callApi } from "./api";
import { useContractor } from "./context";

interface Invoice {
  id: string;
  number: string | null;
  date: string;
  amount: number;
  currency: string;
  status: string;
  plan: PlanId | null;
  description?: string | null;
  url: string | null;
  pdf: string | null;
}

interface PaymentInfo {
  card: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  subscription: { status: string; cancel_at_period_end: boolean; current_period_end: string | null; plan: PlanId | null } | null;
  invoices: Invoice[];
}

type Note = { ok: boolean; text: string } | null;

const money = (cents: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const brandName = (b: string) => (b === "amex" ? "American Express" : b.charAt(0).toUpperCase() + b.slice(1));

const statusStyle: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  open: "bg-amber-100 text-amber-900",
  uncollectible: "bg-red-100 text-red-800",
  void: "bg-slate-200 text-slate-700",
};

function SignIn() {
  const { email } = useContractor();
  const [emailNote, setEmailNote] = useState<Note>(null);
  const [pwNote, setPwNote] = useState<Note>(null);
  const [busy, setBusy] = useState<"email" | "password" | null>(null);

  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const next = String(new FormData(form).get("new_email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(next)) return setEmailNote({ ok: false, text: "Enter a valid email address." });
    if (next.toLowerCase() === email.toLowerCase()) return setEmailNote({ ok: false, text: "That is already your email address." });
    setBusy("email");
    setEmailNote(null);
    const { error } = await getSupabaseBrowser().auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/contractor/account` });
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
    const check = await auth.signInWithPassword({ email, password: current });
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

  const note = (n: Note) => <p role="status" className={`mt-3 text-sm font-medium ${n?.ok ? "text-green-700" : "text-red-700"}`}>{n?.text}</p>;

  return (
    <Panel title="Sign-in details" className="xl:row-span-2">
      <form onSubmit={changeEmail} noValidate className="space-y-3">
        <p className="text-sm text-slate-700">Signed in as <strong>{email}</strong></p>
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
        <Button type="submit" variant="secondary" disabled={busy !== null} className="!rounded-full !px-5 !py-2 text-sm">
          {busy === "password" && <Loader2 className="size-4 animate-spin" aria-hidden />} Change password
        </Button>
        {note(pwNote)}
      </form>
    </Panel>
  );
}

function Alerts() {
  const { email, notifyEmail, listing, reload } = useContractor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!listing) return null;

  async function toggle() {
    setBusy(true);
    setError(false);
    const { error: err } = await getSupabaseBrowser().rpc("set_my_email_alerts", { p_on: !notifyEmail });
    if (err) setError(true);
    else await reload();
    setBusy(false);
  }

  return (
    <Panel title="Email alerts">
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-start gap-2 text-sm text-slate-700">
          {notifyEmail ? <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <BellOff className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />}
          <span>{notifyEmail ? <>We email <strong>{email}</strong> when a customer request is sent to you.</> : "You won't be emailed about new requests. You'll still see them in your dashboard."}</span>
        </p>
        <button type="button" role="switch" aria-checked={notifyEmail} aria-label="Email me new requests" disabled={busy} onClick={toggle}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold disabled:opacity-60 ${notifyEmail ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
          {notifyEmail ? "On" : "Off"}
        </button>
      </div>
      <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">Could not change that. Please try again.</p>}</div>
    </Panel>
  );
}

function Payments() {
  const { listing } = useContractor();
  const now = useNow(60_000);
  const [state, setState] = useState<{ loading: boolean; unavailable: boolean; failed: boolean; data: PaymentInfo | null }>({ loading: true, unavailable: false, failed: false, data: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) return;
    let cancelled = false;
    callApi<PaymentInfo>("/api/stripe/account", {}).then((res) => {
      if (cancelled) return;
      setState({ loading: false, unavailable: res.status === 501, failed: res.status !== 200 && res.status !== 501, data: res.status === 200 ? res.data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [listing]);

  async function updateCard() {
    setBusy(true);
    setError(null);
    const res = await callApi<{ url?: string }>("/api/stripe/portal", { flow: "card" });
    if (res.data.url) return void window.location.assign(res.data.url);
    setBusy(false);
    setError(res.status === 404 ? "There is no subscription to attach a card to yet. Choose a plan first." : "We couldn't open that. Please try again.");
  }

  if (!listing) return <Panel title="Payment method and history"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>;
  if (state.loading) return <Panel title="Payment method and history"><p className="text-sm text-slate-600">Loading…</p></Panel>;
  if (state.unavailable) return <Panel title="Payment method and history"><p className="text-sm text-slate-700">Online payments aren&apos;t switched on yet, so there is nothing to show here.</p></Panel>;
  if (state.failed || !state.data) return <Panel title="Payment method and history"><p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">Your payment details couldn&apos;t be loaded right now. Please try again later.</p></Panel>;

  const { card, subscription, invoices } = state.data;
  const expired = card ? new Date(card.exp_year, card.exp_month, 1).getTime() < now : false;

  return (
    <>
      <Panel title="Payment method">
        {subscription && (
          <p className="mb-4 text-sm text-slate-700">
            Plan: <strong>{planName(subscription.plan ?? undefined)}</strong> · <span className="capitalize">{subscription.status.replace("_", " ")}</span>
            {subscription.current_period_end && <> · {subscription.cancel_at_period_end ? "ends" : "renews"} {day(subscription.current_period_end)}</>}
          </p>
        )}
        {card ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
            <p className="flex items-center gap-3 text-sm text-slate-800">
              <CreditCard className="size-6 text-slate-500" aria-hidden />
              <span>
                <strong>{brandName(card.brand)}</strong> ending in <strong>{card.last4}</strong>
                <span className={`block text-xs ${expired ? "font-semibold text-red-700" : "text-slate-500"}`}>{expired ? "Expired " : "Expires "}{String(card.exp_month).padStart(2, "0")}/{card.exp_year}</span>
              </span>
            </p>
            <Button variant="secondary" onClick={updateCard} disabled={busy} className="!rounded-full !px-4 !py-2 text-sm">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Update card
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            No card on file yet. You enter your card securely with Stripe when you <Link to="/contractor/billing" className="font-semibold text-primary underline">choose a plan</Link>.
          </p>
        )}
        <div role="alert">{error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}</div>
        <p className="mt-4 text-xs text-slate-500">Cards are handled by Stripe. We never see or store your full card number.</p>
      </Panel>

      <Panel title="Payment history" className="xl:col-span-2">
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-600">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr><th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Description</th><th className="pb-2 font-semibold">Amount</th><th className="pb-2 font-semibold">Status</th><th className="pb-2 font-semibold">Receipt</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5 pr-3 text-slate-700">{day(i.date)}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{i.plan ? `${planName(i.plan)} plan` : i.description ?? "Payment"}{i.number && <span className="block text-xs text-slate-500">{i.number}</span>}</td>
                    <td className="py-2.5 pr-3 font-semibold text-navy">{money(i.amount, i.currency)}</td>
                    <td className="py-2.5 pr-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyle[i.status] ?? "bg-slate-100 text-slate-700"}`}>{i.status}</span></td>
                    <td className="py-2.5">
                      {i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">View <ExternalLink className="size-3.5" aria-hidden /></a> : <span className="text-slate-400">—</span>}
                      {i.pdf && <a href={i.pdf} target="_blank" rel="noopener noreferrer" className="ml-3 font-medium text-primary hover:underline">PDF</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">To change plan or cancel, go to <Link to="/contractor/billing" className="font-semibold text-primary underline">Plan &amp; billing</Link>.</p>
      </Panel>
    </>
  );
}

export default function ContractorAccount() {
  return (
    <>
      <PageTitle title="Account settings" />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SignIn />
        <Alerts />
        <Payments />
      </div>
    </>
  );
}
