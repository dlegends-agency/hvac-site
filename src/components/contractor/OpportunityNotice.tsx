import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Briefcase } from "lucide-react";
import { coverageForListing, useHotCounts, useOpportunities } from "@/lib/use-opportunities";
import { useContractor } from "./context";

/** A banner on the dashboard: how many hot permits and government bids are worth a look for this business today. */
export function OpportunityNotice() {
  const { listing } = useContractor();
  const opps = useOpportunities(Boolean(listing));
  const cover = useMemo(() => coverageForListing(listing), [listing]);
  const { hotPermits, hotBids, closingSoon } = useHotCounts(opps, cover);
  if (opps.loading || (opps.permits.length === 0 && opps.bids.length === 0)) return null;
  const total = hotPermits + hotBids;
  return (
    <Link to="/contractor/opportunities" className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Briefcase className="size-5" aria-hidden /></span>
      <span>
        <span className="block font-semibold text-navy">
          {total > 0 ? `${total} hot ${total === 1 ? "opportunity" : "opportunities"} for you` : "New opportunities for you"}
        </span>
        <span className="text-sm text-slate-700">
          {opps.bids.length} government {opps.bids.length === 1 ? "bid" : "bids"}{closingSoon > 0 ? ` (${closingSoon} closing within a week)` : ""} and {opps.permits.length} building {opps.permits.length === 1 ? "permit" : "permits"}, ranked Hot, Warm and Cold.
        </span>
      </span>
    </Link>
  );
}
