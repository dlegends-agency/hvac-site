import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PageTitle, Panel, StatStrip } from "@/components/admin/widgets";
import { BidBoard } from "@/components/opportunities/BidBoard";
import { PermitBoard } from "@/components/opportunities/PermitBoard";
import { leadPrice } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { coverageForListing, useOpportunities } from "@/lib/use-opportunities";
import { callApi } from "./api";
import { useContractor } from "./context";

/**
 * Two lead sources sent to this business when the job is within its reach (its city or listed cities, or within its travel radius of
 * its business ZIP code): HVAC building permits and open federal HVAC bids, each ranked Hot, Warm and Cold. Everything is visible
 * except the phone number and email, which unlock for a one-time payment per lead.
 */
export default function ContractorOpportunities() {
  const { listing } = useContractor();
  const [params, setParams] = useSearchParams();
  const opps = useOpportunities(Boolean(listing));
  const cover = useMemo(() => coverageForListing(listing), [listing]);
  const tab = params.get("tab") === "permits" ? "permits" : "bids";
  const price = listing && activePlan(listing) !== "free" ? leadPrice.paid : leadPrice.free;

  // Coming back from Stripe: ask the server whether the payment went through (it unlocks the lead), then load the lists again.
  const sessionId = params.get("unlocked") === "1" ? params.get("session_id") : null;
  const [paid, setPaid] = useState<"working" | "done" | "failed" | null>(sessionId ? "working" : null);
  const { reload } = opps;
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    void (async () => {
      const res = await callApi<{ paid?: boolean }>("/api/stripe/confirm", { sessionId });
      reload();
      if (live) setPaid(res.data.paid ? "done" : "failed");
    })();
    return () => {
      live = false;
    };
  }, [sessionId, reload]);
  const openId = params.get("open");

  if (!listing) {
    return (
      <>
        <PageTitle title="Opportunities" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  const tabs = [
    { id: "bids", label: "Government bids", count: opps.bids.length },
    { id: "permits", label: "Building permits", count: opps.permits.length },
  ] as const;
  const lockedCount = opps.bids.filter((b) => b.unlocked === false).length + opps.permits.filter((p) => p.unlocked === false).length;
  const unlockedCount = opps.bids.length + opps.permits.length - lockedCount;
  const unlock = { price };

  return (
    <>
      <PageTitle title="Opportunities" description={<>Jobs near your business address, found for you every morning. You can see everything about each one except the phone number and email, which unlock for <strong>${price}</strong> per lead.</>} />

      {paid === "working" && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-navy"><Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking the contact details…</p>}
      {paid === "done" && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-900">Unlocked. The phone number and email are now on the lead.</p>}
      {paid === "failed" && <p role="alert" className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">We could not confirm that payment yet. Refresh in a minute. If the lead is still locked, contact us with the time of your payment and we will unlock it.</p>}

      <StatStrip items={[
        { label: "Government bids near you", value: opps.loading ? "…" : opps.bids.length },
        { label: "Building permits near you", value: opps.loading ? "…" : opps.permits.length },
        { label: "Locked (pay to see contact)", value: opps.loading ? "…" : lockedCount, tone: lockedCount > 0 ? "warn" : undefined },
        { label: "Unlocked", value: opps.loading ? "…" : unlockedCount, tone: unlockedCount > 0 ? "good" : undefined },
      ]} />

      <div role="tablist" aria-label="Opportunity type" className="mb-5 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setParams(t.id === "bids" ? {} : { tab: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{opps.loading ? "…" : t.count}</span>
          </button>
        ))}
      </div>

      {opps.loading ? (
        <p className="text-slate-600">Loading…</p>
      ) : tab === "bids" ? (
        <BidBoard
          key="bids"
          bids={opps.bids}
          error={opps.error && opps.bids.length === 0}
          cover={cover}
          unlock={unlock}
          initialOpenId={openId}
          intro={<>Open federal contracts for HVAC work within reach of your business. Many are reserved for small businesses. The score favours new notices, enough time to prepare an offer, small-business set-asides and work in your area.</>}
          emptyText="No open federal HVAC bids within reach of your business right now. New ones are added every morning."
        />
      ) : (
        <PermitBoard
          key="permits"
          permits={opps.permits}
          error={opps.error && opps.permits.length === 0}
          cover={cover}
          unlock={unlock}
          initialOpenId={openId}
          intro={<>New HVAC building permits within reach of your business (Austin and Dallas so far). The score favours new permits, bigger jobs and work in your area.</>}
          emptyText="No building permits within reach of your business yet. New ones are added every morning. Check that your ZIP code and travel distance are set under My business."
        />
      )}
    </>
  );
}
