import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { planName, plans } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { PlanId } from "@/lib/types";
import { useContractor } from "./context";

async function callApi(path: string, body: unknown): Promise<{ url?: string; error?: string; status: number }> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    return { ...json, status: res.status };
  } catch {
    return { error: "network", status: 0 };
  }
}

export default function ContractorBilling() {
  const { listing, billing } = useContractor();
  const [params] = useSearchParams();
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
  const wanted = params.get("plan");

  async function go(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    const res = await callApi(path, body);
    if (res.url) return void window.location.assign(res.url);
    setBusy(null);
    setError(
      res.status === 501
        ? "Online payments aren't switched on yet. Please contact us and we'll set up your plan."
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
      </p>

      <ul className="grid max-w-5xl gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === current;
          return (
            <li key={p.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${p.id === wanted && !isCurrent ? "border-primary ring-2 ring-primary/20" : "border-slate-200"}`}>
              <h2 className="text-lg font-bold text-navy">{p.name}</h2>
              <p className="mt-1 text-2xl font-extrabold text-navy">{p.price === 0 ? "Free" : `$${p.price}`}{p.price > 0 && <span className="text-sm font-normal text-slate-600"> / month</span>}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> {f}</li>)}
              </ul>
              {isCurrent ? (
                <p className="mt-5 rounded-full bg-green-50 py-2 text-center text-sm font-semibold text-green-800">Your current plan</p>
              ) : p.id === "free" ? (
                <p className="mt-5 text-center text-xs text-slate-500">To downgrade, cancel in the billing portal.</p>
              ) : (
                <Button onClick={() => go("/api/stripe/checkout", { plan: p.id satisfies PlanId }, p.id)} disabled={busy !== null} className="mt-5 !rounded-full">
                  {busy === p.id && <Loader2 className="size-4 animate-spin" aria-hidden />} {current === "free" ? `Choose ${p.name}` : `Switch to ${p.name}`}
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
            <p className="text-sm text-slate-600">Update your card, download invoices, change plan or cancel in Stripe&apos;s secure billing portal.</p>
            <Button variant="secondary" onClick={() => go("/api/stripe/portal", {}, "portal")} disabled={busy !== null} className="mt-3 !rounded-full">
              {busy === "portal" && <Loader2 className="size-4 animate-spin" aria-hidden />} Open billing portal
            </Button>
          </Panel>
        </div>
      )}
      <p className="mt-6 max-w-3xl text-xs text-slate-500">
        Payments are processed by Stripe; we never see or store your card number. Paid plans are advertising and don&apos;t guarantee customer requests. See the <Link to="/terms-of-use" className="underline">Terms of Use</Link>.
      </p>
    </>
  );
}
