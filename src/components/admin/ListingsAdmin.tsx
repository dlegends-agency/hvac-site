import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase";
import { LISTING_STATUSES, type Listing, type ListingStatus } from "@/lib/types";
import { PageTitle, QueryState } from "./widgets";

const badge: Record<ListingStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  published: "bg-green-100 text-green-800",
  hidden: "bg-slate-200 text-slate-700",
};

export function ListingsAdmin() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<ListingStatus | "all">("all");

  useEffect(() => {
    getSupabaseBrowser()
      .from("listings")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        setError(Boolean(error));
        setRows((data as Listing[] | null) ?? []);
        setLoading(false);
      });
  }, []);

  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <>
      <PageTitle title="Directory listings">
        <Link to="/admin/listings/new" className={buttonClass("primary", "!py-2")}><Plus className="size-4" aria-hidden /> Add listing</Link>
      </PageTitle>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(["all", ...LISTING_STATUSES] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${filter === s ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
            {s} ({s === "all" ? rows.length : rows.filter((r) => r.status === s).length})
          </button>
        ))}
      </div>
      <QueryState loading={loading} error={error}>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">No listings here yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {shown.map((l) => (
              <li key={l.id}>
                <Link to={`/admin/listings/${l.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-navy">{l.business_name}</span>
                    <span className="block truncate text-sm text-slate-500">{l.city}, {l.state} · {l.phone ?? "no phone"}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badge[l.status]}`}>{l.status}</span>
                  <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
