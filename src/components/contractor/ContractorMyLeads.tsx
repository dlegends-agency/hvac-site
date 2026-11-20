import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Loader2, Lock, MapPin, Trash2 } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { callApi } from "./api";
import { useContractor } from "./context";
import { UnlockButtons } from "./UnlockButtons";
import { KIND_LABEL, KIND_STYLE, type PipelineRow, useLeadHub } from "./useLeadHub";

/**
 * My Leads: the leads the business saved from the Leads page while it decides. Each one shows whether it is unlocked and what unlocking costs.
 * Once decided, unlock it (pay), then start the project to track it on the Projects page. Premium leads are all unlocked.
 */
export default function ContractorMyLeads() {
  const { listing } = useContractor();
  const hub = useLeadHub(listing);
  const { items, pipeline, plan, reloadAll } = hub;
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);

  // Back from Stripe after paying: confirm the payment, then load again.
  const sessionId = params.get("unlocked") === "1" ? params.get("session_id") : null;
  const [waiting, setWaiting] = useState(params.get("unlocked") === "1");
  useEffect(() => {
    if (params.get("unlocked") !== "1") return;
    if (sessionId) void callApi("/api/stripe/confirm", { sessionId }).then(() => reloadAll());
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      reloadAll();
      if (tries >= 5) {
        window.clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [params, sessionId, reloadAll]);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const saved = pipeline.filter((r) => r.stage === "saved");
  const rows = saved.map((r) => ({ r, item: byKey.get(`${r.kind}:${r.item_id}`) ?? null }));
  const toBuy = rows.filter((x) => x.item && !x.item.unlocked);
  const total = toBuy.reduce((s, x) => s + (x.item?.price ?? 0), 0);

  if (!listing) {
    return (
      <>
        <PageTitle title="My Leads" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  async function start(r: PipelineRow) {
    setBusy(`${r.kind}:${r.item_id}`);
    await hub.update(r, { stage: "contacted" });
    setBusy(null);
  }
  async function drop(r: PipelineRow) {
    setBusy(`${r.kind}:${r.item_id}`);
    await hub.remove(r);
    setBusy(null);
  }
  const returnTo = "/contractor/my-leads?unlocked=1";

  return (
    <>
      <PageTitle title="Leads" description="Leads you saved while you decide, and every lead you have paid for. Unlock one, then start the project." />
      {waiting && params.get("unlocked") === "1" && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900"><Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking, this takes a few seconds…</p>
      )}
      {saved.length > 0 && (
        <p className="mb-4 text-sm text-slate-600">
          {rows.filter((x) => x.item?.unlocked).length} ready to start{toBuy.length > 0 && plan !== "premium" ? <> · {toBuy.length} still locked (${total} to unlock all)</> : null}
        </p>
      )}

      {hub.pipelineError ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">My Leads could not be loaded. Run <code>supabase/schema-revamp.sql</code> in the Supabase SQL Editor.</p>
      ) : saved.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-navy">Nothing saved yet</p>
          <p className="mt-2 text-sm text-slate-600">In Find leads, tick the customer requests, bids and permits worth a second look and choose <strong>Save</strong>.</p>
          <Link to="/contractor/leads" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Find leads <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map(({ r, item }) => {
            const key = `${r.kind}:${r.item_id}`;
            const gone = !item;
            return (
              <li key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                    <p className="mt-1.5 font-semibold text-navy">{item?.title ?? r.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {(item?.place ?? r.place) && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {item?.place ?? r.place}</span>}
                      {item?.fact && <span className="font-semibold text-slate-700">{item.fact}</span>}
                      <span>Saved {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {gone ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">No longer available</span>
                      : item.unlocked ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800"><Check className="size-3" aria-hidden /> Unlocked</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"><Lock className="size-3" aria-hidden /> Locked, ${item.price} to unlock</span>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {item && !item.unlocked && (
                    <Button onClick={() => setPayOpen(payOpen === key ? null : key)} className="!rounded-full !px-4 !py-2 text-sm">Unlock for ${item.price}</Button>
                  )}
                  {item?.unlocked && (
                    <Button onClick={() => void start(r)} disabled={busy === key} className="!rounded-full !px-4 !py-2 text-sm">
                      {busy === key && <Loader2 className="size-4 animate-spin" aria-hidden />} Start project
                    </Button>
                  )}
                  {item && <Link to={`/contractor/leads?open=${key}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50">View details</Link>}
                  {!(item?.unlocked && plan !== "premium") && <button type="button" onClick={() => void drop(r)} disabled={busy === key} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-red-700"><Trash2 className="size-4" aria-hidden /> Remove</button>}
                </div>
                {item && !item.unlocked && payOpen === key && (
                  <div className="mt-3">
                    {r.kind === "lead"
                      ? <UnlockButtons endpoint="/api/stripe/unlock" body={{ leadId: r.item_id }} price={item.price} returnTo={returnTo} />
                      : <UnlockButtons endpoint="/api/stripe/unlock-opportunity" body={{ kind: r.kind, itemId: r.item_id }} price={item.price} returnTo={returnTo} />}
                    <p className="mt-2 text-xs text-slate-500">One payment for this lead. Not refundable.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {plan !== "premium" && toBuy.length > 1 && (
        <p className="mt-4 text-sm text-slate-600">Unlocking everything on this list costs ${total}. <Link to="/contractor/billing" className="font-semibold text-primary underline">Premium unlocks every lead</Link> without paying one by one.</p>
      )}
    </>
  );
}
