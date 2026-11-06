import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "@/lib/admin-hooks";
import { ADMIN_EVENTS, PROBLEM_EVENTS, TONE_CLASS, eventInfo } from "@/lib/flow";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FlowHealth } from "./FlowHealth";
import { PageTitle, Panel } from "./widgets";

interface EventRow {
  id: number;
  created_at: string;
  lead_id: string;
  kind: string;
  detail: string | null;
  listings: { business_name: string } | null;
  leads: { first_name: string; last_name: string; issue: string; city: string } | null;
}

interface Unmatched {
  id: string;
  created_at: string;
  issue: string;
  city: string;
  state: string;
  postal_code: string;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The request flow log: every step every request went through, newest first, with the problems one click away. */
export function FlowLogs() {
  const supabase = getSupabaseBrowser();
  const [filter, setFilter] = useState<"all" | "problems" | string>("all");

  const feed = useLiveQuery<EventRow[]>(
    [],
    () => {
      const base = supabase.from("lead_events").select("id, created_at, lead_id, kind, detail, listings(business_name), leads(first_name, last_name, issue, city)").order("id", { ascending: false }).limit(200);
      if (filter === "problems") return base.in("kind", PROBLEM_EVENTS);
      if (filter !== "all") return base.eq("kind", filter);
      return base;
    },
    { key: `flow-feed-${filter}`, intervalMs: 15_000 },
  );
  const unmatched = useLiveQuery<Unmatched[]>([], () => supabase.rpc("admin_unmatched_leads"), { key: "flow-unmatched", intervalMs: 30_000 });

  return (
    <>
      <PageTitle title="Logs" />
      <p className="mb-5 max-w-3xl text-sm text-slate-600">
        Every step a customer request goes through is written down here as it happens: received, sent to businesses, email alerts, unlocks and what each business did next.
      </p>
      <FlowHealth showLink={false} />

      {unmatched.data.length > 0 && (
        <div className="mb-6">
          <Panel title={`Requests nobody received (${unmatched.data.length})`}>
            <p className="mb-3 text-sm text-slate-600">No business serves these areas yet, or routing failed. Open a request and use &quot;Send to matching contractors&quot;, or add a business by hand.</p>
            <ul className="divide-y divide-slate-100 text-sm">
              {unmatched.data.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><Link to={`/admin/leads/${l.id}`} className="font-semibold text-primary hover:underline">{l.issue}</Link> <span className="text-slate-600">· {l.city}, {l.state} {l.postal_code}</span></span>
                  <span className="text-slate-500">{when(l.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <Panel title="Activity">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="flow-filter" className="text-sm font-medium text-slate-700">Show</label>
          <select id="flow-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
            <option value="all">Everything</option>
            <option value="problems">Problems only</option>
            {Object.entries(ADMIN_EVENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <span className="text-xs text-slate-500">Latest 200 events</span>
        </div>
        {feed.error ? (
          <p className="text-sm text-orange-900">The log could not be loaded. Run <code>supabase/schema-flow.sql</code> in the Supabase SQL Editor.</p>
        ) : feed.data.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing here yet. New requests will show up as they arrive.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className="py-2 pr-4 font-medium">When</th><th className="py-2 pr-4 font-medium">Step</th><th className="py-2 pr-4 font-medium">Business</th><th className="py-2 pr-4 font-medium">Request</th><th className="py-2 font-medium">Detail</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {feed.data.map((e) => {
                  const info = eventInfo(e.kind);
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{when(e.created_at)}</td>
                      <td className="py-2 pr-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[info.tone]}`}>{info.label}</span></td>
                      <td className="py-2 pr-4 text-slate-800">{e.listings?.business_name ?? "–"}</td>
                      <td className="py-2 pr-4">
                        <Link to={`/admin/leads/${e.lead_id}`} className="font-medium text-primary hover:underline">{e.leads ? `${e.leads.first_name} ${e.leads.last_name}` : "Request"}</Link>
                        {e.leads && <span className="block text-xs text-slate-500">{e.leads.issue} · {e.leads.city}</span>}
                      </td>
                      <td className="py-2 text-slate-600">{e.detail ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
