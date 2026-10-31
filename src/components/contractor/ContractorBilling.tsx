import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2, Lock } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { leadPrice, planName, plans, yearlySaving } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { callApi } from "./api";
import { useContractor } from "./context";

type Interval = "month" | "year";

export default function ContractorBilling() {
  const { listing, billing } = useContractor();
  const [params] = useSearchParams();
  const [interval, setInterval] = useState<Interval>(params.get("interval") === "month" ? "month" : "year");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!listing) {
    return (
      <>
        <PageTitle title="Plan & billing" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> before choosing a plan.</p></Panel>
      </>
    );
  }

  const current = activePlan(listing);
  const wantsFeatured = params.get("plan") === "featured";

  async function go(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    const res = await callApi<{ url?: string }>(path, body);
    if (res.data.url) return void window.location.assign(res.data.url);
    setBusy(null);
    setError(
      res.status === 501
        ? "Online payments aren't switched on yet. Please contact us and we'll set up your plan."
        : res.status === 409
          ? "You already have an active subscription. Use \"Manage subscription\" below to change it."
          : "We couldn't start that. Please try again, or contact us if it keeps happening.",
    );
  }

  return (
    <>
      <PageTitle title="Plan & billing" />
      {params.get("status") === "success" && (
        <p role="status" className="mb-5 max-w-3xl rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Thank you. Your payment went through. It can take a minute for your plan to update here; refresh if you don&apos;t see it yet.
        </p>
      )}
      <p className="mb-5 max-w-3xl text-sm text-slate-700">
        Current plan: <strong>{planName(current)}</strong>
        {billing?.current_period_end && current !== "free" && <> · renews or ends {new Date(billing.current_period_end).toLocaleDateString()}</>}
        {" "}· Unlocking a customer request costs <strong>${current === "free" ? leadPrice.free : leadPrice.paid}</strong> each.
      </p>

      <div role="group" aria-label="Billing period" className="mb-6 inline-flex rounded-full border border-slate-300 bg-white p-1 text-sm font-semibold">
        {(["month", "year"] as const).map((i) => (
          <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval(i)}
            className={`rounded-full px-5 py-2 ${interval === i ? "bg-primary text-white" : "text-navy hover:bg-slate-50"}`}>
            {i === "month" ? "Monthly" : <>Yearly <span className={interval === i ? "text-blue-100" : "text-green-700"}>save ${yearlySaving}</span></>}
          </button>
        ))}
      </div>

      <ul className="grid max-w-4xl gap-5 md:grid-cols-2">
        {plans.map((p) => {
          const isCurrent = p.id === current;
          return (
            <li key={p.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${p.id === "featured" && wantsFeatured && !isCurrent ? "border-primary ring-2 ring-primary/20" : "border-slate-200"}`}>
              <h2 className="text-lg font-bold text-navy">{p.name}</h2>
              <p className="mt-1 text-2xl font-extrabold text-navy">
                {p.price[interval] === 0 ? "Free" : `$${p.price[interval]}`}
                {p.price[interval] > 0 && <span className="text-sm font-normal text-slate-600"> / {interval === "month" ? "month" : "year"}</span>}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> {f}</li>)}
                {p.locked?.map((f) => <li key={f} className="flex items-start gap-2 text-slate-500"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {f}</li>)}
              </ul>
              <div className="flex-1" />
              {isCurrent ? (
                <p className="mt-5 rounded-full bg-green-50 py-2 text-center text-sm font-semibold text-green-800">Your current plan</p>
              ) : p.id === "free" ? (
                <p className="mt-5 text-center text-xs text-slate-500">To go back to Free, cancel below. You keep Featured until the end of the period you paid for.</p>
              ) : (
                <Button onClick={() => go("/api/stripe/checkout", { plan: "featured", interval }, p.id)} disabled={busy !== null} className="mt-5 !rounded-full">
                  {busy === p.id && <Loader2 className="size-4 animate-spin" aria-hidden />} Get Featured, {interval === "month" ? "monthly" : "yearly"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <div role="alert" className="mt-4 max-w-3xl">{error && <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">{error}</p>}</div>

      {billing?.stripe_customer_id && (
        <div className="mt-6 max-w-3xl">
          <Panel title="Manage your subscription">
            <p className="text-sm text-slate-600">Switch between monthly and yearly, update your card, download invoices or cancel in Stripe&apos;s secure billing portal.</p>
            <Button variant="secondary" onClick={() => go("/api/stripe/portal", {}, "portal")} disabled={busy !== null} className="mt-3 !rounded-full">
              {busy === "portal" && <Loader2 className="size-4 animate-spin" aria-hidden />} Manage subscription
            </Button>
          </Panel>
        </div>
      )}
      <p className="mt-6 max-w-3xl text-xs text-slate-500">
        Payments are processed by Stripe; we never see or store your card number. Paid plans are advertising and don&apos;t guarantee customer requests. Unlocked requests are not refundable.
        See the <Link to="/terms-of-use" className="underline">Terms of Use</Link>.
      </p>
    </>
  );
}
