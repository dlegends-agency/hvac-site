import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLeads } from "@/lib/admin-hooks";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { inputClass } from "@/components/ui/Field";
import { PageTitle, QueryState, StatusBadge } from "./widgets";

export function LeadsList() {
  const { data: leads, loading, error, reload } = useLeads();
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const shown = leads.filter(
    (l) =>
      (filter === "all" || l.status === filter) &&
      (!term || [l.first_name, l.last_name, l.email, l.phone, l.city, l.issue].join(" ").toLowerCase().includes(term)),
  );

  return (
    <>
      <PageTitle title="Leads">
        <Button variant="secondary" onClick={reload} disabled={loading} aria-label="Refresh leads">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Refresh
        </Button>
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
          <label htmlFor="lead-search" className="sr-only">Search leads</label>
          <input id="lead-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, city…"
            className={`${inputClass} !pl-9`} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {(["all", ...LEAD_STATUSES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${filter === s ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
              {s} ({s === "all" ? leads.length : leads.filter((l) => l.status === s).length})
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <QueryState loading={loading} error={error}>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">No leads to show.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {shown.map((l) => (
                <li key={l.id}>
                  <Link to={`/admin/leads/${l.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-navy">{l.first_name} {l.last_name}</span>
                      <span className="block truncate text-sm text-slate-600">{l.issue} · {l.urgency}</span>
                      <span className="block truncate text-sm text-slate-500">{l.city}, {l.state} · {l.phone}</span>
                    </span>
                    <span className="hidden text-sm text-slate-500 sm:block">{new Date(l.created_at).toLocaleDateString()}</span>
                    <StatusBadge status={l.status} />
                    <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </>
  );
}
