import { Link } from "react-router-dom";
import { Clock, FileCheck2, Lock, MapPin } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { useContractor } from "./context";
import { useLeadHub } from "./useLeadHub";
import { ago } from "./useMyLeads";

/** Bid Preparation: where government contracts are worked up before a bid goes in. This first version lists the bids; the document and proposal tools come next. */
export default function ContractorBidPreparation() {
  const { listing } = useContractor();
  const hub = useLeadHub(listing);
  if (!listing) {
    return (
      <>
        <PageTitle title="Bid Preparation" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }
  const bids = hub.items.filter((i) => i.kind === "bid");
  const mine = bids.filter((i) => i.unlocked);
  const locked = bids.filter((i) => !i.unlocked);

  const row = (i: (typeof bids)[number]) => (
    <li key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link to={`/contractor/leads?type=bid&open=${i.key}`} className="line-clamp-2 font-semibold text-navy hover:text-primary">{i.subject}</Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {i.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {i.place}</span>}
          {i.when && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> Posted {ago(i.when.length === 10 ? `${i.when}T12:00:00Z` : i.when)}</span>}
          {i.fact && <span className="font-semibold text-slate-700">{i.fact}</span>}
        </p>
      </div>
      {i.unlocked
        ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">Unlocked</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900"><Lock className="size-3" aria-hidden /> Locked · ${i.price}</span>}
    </li>
  );

  return (
    <>
      <PageTitle title="Bid Preparation" description="Government contracts you can pursue, with their deadlines. Submit bids on the agency's own site; you stay in charge of every submission." />
      <p className="mb-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-800">
        <FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>Next in this area: upload a solicitation, get its requirements and a compliance checklist, draft the proposal and track each bid from review to award. For now, this lists the government contracts near you.</span>
      </p>
      {hub.loading ? <p className="text-slate-600">Loading…</p> : (
        <div className="grid gap-6">
          <Panel title={`Your government bids (${mine.length})`}>
            {mine.length === 0 ? <p className="text-sm text-slate-600">None yet. Unlock a government contract under <Link to="/contractor/leads?type=bid" className="font-semibold text-primary underline">Discover Opportunities</Link> and it appears here.</p> : <ul className="-mx-4 divide-y divide-slate-100">{mine.map(row)}</ul>}
          </Panel>
          <Panel title={`Open to unlock (${locked.length})`}>
            {locked.length === 0 ? <p className="text-sm text-slate-600">No other government contracts near you right now.</p> : <ul className="-mx-4 divide-y divide-slate-100">{locked.slice(0, 15).map(row)}</ul>}
          </Panel>
        </div>
      )}
    </>
  );
}
