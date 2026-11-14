import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { BidBoard } from "@/components/opportunities/BidBoard";
import { PermitBoard } from "@/components/opportunities/PermitBoard";
import { coverageForListing, useOpportunities } from "@/lib/use-opportunities";
import { useContractor } from "./context";

/** Two lead sources for this business: HVAC building permits and open federal HVAC bids, each ranked Hot, Warm and Cold. */
export default function ContractorOpportunities() {
  const { listing } = useContractor();
  const [params, setParams] = useSearchParams();
  const opps = useOpportunities(Boolean(listing));
  const cover = useMemo(() => coverageForListing(listing), [listing]);
  const tab = params.get("tab") === "permits" ? "permits" : "bids";

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

  return (
    <>
      <PageTitle title="Opportunities" />
      <p className="mb-4 max-w-4xl text-sm text-slate-700">
        Work you could go after, found for you every morning. <strong>Government bids</strong> are open federal HVAC contracts in Texas from SAM.gov. <strong>Building permits</strong> are new HVAC permits from city records.
        Each one is scored Hot, Warm or Cold for your business, with the reasons. Open one to see the details.
      </p>

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
          intro={<>Open federal contracts for HVAC work in Texas. Many are reserved for small businesses. The score favours new notices, enough time to prepare an offer, small-business set-asides and work in your area.</>}
          emptyText="No open federal HVAC bids in Texas right now. New ones are added every morning."
        />
      ) : (
        <PermitBoard
          key="permits"
          permits={opps.permits}
          error={opps.error && opps.permits.length === 0}
          cover={cover}
          intro={<>New HVAC building permits from city records (Austin and Dallas so far). The score favours new permits, bigger jobs and work in your area.</>}
          emptyText="No building permits yet. New ones are added every morning."
        />
      )}
    </>
  );
}
