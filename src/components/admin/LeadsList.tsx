import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
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
        <Button variant="secondary" onClick={() => downloadCsv("leads", [["Name", "Email", "Phone", "City", "State", "Issue", "Urgency", "Status", "Received"], ...shown.map((l) => [`${l.first_name} ${l.last_name}`, l.email, l.phone, l.city, l.state, l.issue, l.urgency, l.status, l.created_at])])} disabled={shown.length === 0}>
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
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
                    <span className="grid min-w-0 flex-1 gap-x-6 gap-y-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 truncate font-semibold text-navy">{l.status === "new" && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}{l.first_name} {l.last_name}</span>
                        <span className="block truncate text-sm text-slate-500">{l.phone}</span>
                        <span className="block truncate text-sm text-slate-500">{l.city}, {l.state}</span>
                      </span>
                      <span className="min-w-0 md:border-l md:border-slate-100 md:pl-6">
                        <span className="block text-[11px] font-bold tracking-wide text-slate-500 uppercase">Concern</span>
                        <span className="block text-sm text-slate-800 md:line-clamp-2">{l.issue}</span>
                        <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{l.urgency}</span>
                      </span>
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
