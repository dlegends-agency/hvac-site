import { activePlan } from "@/lib/plans";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Download, EyeOff, Plus, Search, Siren, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { LISTING_STATUSES, type Listing, type ListingStatus } from "@/lib/types";
import { DirectoryTabs } from "./DirectoryTabs";
import { PageTitle, QueryState } from "./widgets";

const PAGE = 25;
const statusBadge: Record<ListingStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  published: "bg-green-100 text-green-800",
  hidden: "bg-slate-200 text-slate-700",
};
const sourceLabel: Record<string, string> = { submitted: "Submitted", seed: "Seeded", agent: "Found by agent", manual: "Added by admin" };
type Sort = "newest" | "name" | "city";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function ListingsAdmin() {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<Listing[]>([], () => supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(2000), { key: "listings-admin", intervalMs: 60_000 });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListingStatus | "all">("all");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ListingStatus>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(
    () => q.data.filter((l) => !deleted.has(l.id)).map((l) => ({ ...l, status: statusOverrides[l.id] ?? l.status })),
    [q.data, statusOverrides, deleted],
  );
  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, published: 0, hidden: 0 } as Record<ListingStatus | "all", number>;
    for (const l of rows) c[l.status]++;
    return c;
  }, [rows]);
  const cities = useMemo(() => [...new Set(rows.map((l) => l.city))].sort(), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter(
      (l) =>
        (status === "all" || l.status === status) &&
        (!city || l.city === city) &&
        (!source || (l.source ?? "submitted") === source) &&
        (!emergency || l.emergency_service) &&
        (!term || [l.business_name, l.city, l.phone, l.website, l.address].join(" ").toLowerCase().includes(term)),
    );
    if (sort === "name") list.sort((a, b) => a.business_name.localeCompare(b.business_name));
    if (sort === "city") list.sort((a, b) => a.city.localeCompare(b.city) || a.business_name.localeCompare(b.business_name));
    return list;
  }, [rows, status, city, source, emergency, search, sort]);
  const shown = filtered.slice(0, visible);
  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function setStatuses(ids: string[], next: ListingStatus) {
    if (ids.length === 0) return;
    setStatusOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, next])) }));
    const { error } = await supabase.from("listings").update({ status: next }).in("id", ids);
    if (error) {
      setStatusOverrides((o) => {
        const copy = { ...o };
        for (const id of ids) delete copy[id];
        return copy;
      });
      setMsg("Could not update. Please try again.");
    } else {
      setMsg(`${ids.length} listing${ids.length === 1 ? "" : "s"} set to ${next}.`);
      void q.reload();
    }
    setSelected(new Set());
  }

  async function removeSelected() {
    const ids = [...selected];
    if (ids.length === 0 || !window.confirm(`Delete ${ids.length} listing${ids.length === 1 ? "" : "s"} permanently?`)) return;
    const { error } = await supabase.from("listings").delete().in("id", ids);
    if (error) return setMsg("Could not delete. Please try again.");
    setDeleted((d) => new Set([...d, ...ids]));
    setSelected(new Set());
    setMsg(`${ids.length} deleted.`);
  }

  function exportCsv() {
    const head = ["name", "status", "source", "city", "state", "phone", "website", "address", "emergency", "services"];
    const lines = [head.join(",")].concat(
      filtered.map((l) => [l.business_name, l.status, l.source ?? "submitted", l.city, l.state, l.phone, l.website, l.address, l.emergency_service ? "yes" : "no", l.services.join("; ")].map(csvCell).join(",")),
    );
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `listings-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm font-medium capitalize ${active ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`;

  return (
    <>
      <PageTitle title="Directory">
        <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0} className="!py-2 text-sm"><Download className="size-4" aria-hidden /> Export CSV</Button>
        <Link to="/admin/listings/new" className={buttonClass("primary", "!py-2 text-sm")}><Plus className="size-4" aria-hidden /> Add listing</Link>
      </PageTitle>
      <DirectoryTabs />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: counts.all },
          { label: "Pending review", value: counts.pending, hot: counts.pending > 0 },
          { label: "Published", value: counts.published },
          { label: "Hidden", value: counts.hidden },
        ].map((k) => (
          <div key={k.label} className={`rounded-2xl border bg-white p-4 shadow-sm ${k.hot ? "border-orange-300" : "border-slate-200"}`}>
            <p className="text-sm text-slate-600">{k.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${k.hot ? "text-emergency" : "text-navy"}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
          <label htmlFor="listing-search" className="sr-only">Search listings</label>
          <input id="listing-search" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }} placeholder="Search name, city, phone, website…" className={`${inputClass} !pl-9`} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {(["all", ...LISTING_STATUSES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => { setStatus(s); setVisible(PAGE); }} className={chip(status === s)}>{s} ({counts[s]})</button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="f-city">City</label>
        <select id="f-city" value={city} onChange={(e) => { setCity(e.target.value); setVisible(PAGE); }} className={`${inputClass} !w-auto`}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-source">Source</label>
        <select id="f-source" value={source} onChange={(e) => { setSource(e.target.value); setVisible(PAGE); }} className={`${inputClass} !w-auto`}>
          <option value="">All sources</option>
          {Object.entries(sourceLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-sort">Sort</label>
        <select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputClass} !w-auto`}>
          <option value="newest">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="city">City, then name</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={emergency} onChange={(e) => { setEmergency(e.target.checked); setVisible(PAGE); }} className="size-4 accent-primary" /> Emergency service only
        </label>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-blue-50 p-3">
          <span className="text-sm font-semibold text-navy">{selected.size} selected</span>
          <Button onClick={() => setStatuses([...selected], "published")} className="!rounded-full !px-3.5 !py-1.5 text-sm"><Check className="size-4" aria-hidden /> Publish</Button>
          <Button variant="secondary" onClick={() => setStatuses([...selected], "hidden")} className="!rounded-full !px-3.5 !py-1.5 text-sm"><EyeOff className="size-4" aria-hidden /> Hide</Button>
          <Button variant="secondary" onClick={removeSelected} className="!rounded-full !px-3.5 !py-1.5 text-sm !text-red-700"><Trash2 className="size-4" aria-hidden /> Delete</Button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm font-medium text-slate-600 hover:underline">Clear</button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-600">{msg}</p>

      <QueryState loading={q.loading} error={q.error}>
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            {rows.length === 0 ? "No listings yet. Add one, run the seed SQL, or use Find businesses." : "No listings match these filters."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <label className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm text-slate-600">
              <input type="checkbox" checked={allShownSelected} aria-label="Select all shown" className="size-4 accent-primary"
                onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((l) => l.id)))} />
              Showing {shown.length} of {filtered.length}
            </label>
            <ul className="divide-y divide-slate-100">
              {shown.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/60">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.business_name}`} className="size-4 shrink-0 accent-primary" />
                  <Link to={`/admin/listings/${l.id}`} className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-navy">{l.business_name}</span>
                      {l.emergency_service && <Siren className="size-4 text-emergency" aria-label="Offers emergency service" />}
                    </span>
                    <span className="block truncate text-sm text-slate-500">{l.city}, {l.state} · {l.phone ?? "no phone"} · {l.services.length} {l.services.length === 1 ? "service" : "services"}</span>
                  </Link>
                  <span className="hidden rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 md:inline">{sourceLabel[l.source ?? "submitted"]}</span>
                  {activePlan(l) !== "free" && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-amber-900">{activePlan(l)}</span>}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadge[l.status]}`}>{l.status}</span>
                  <div className="hidden gap-1.5 sm:flex">
                    {l.status !== "published" && <Button onClick={() => setStatuses([l.id], "published")} className="!rounded-full !px-3 !py-1 text-xs" aria-label={`Publish ${l.business_name}`}>Publish</Button>}
                    {l.status !== "hidden" && <Button variant="secondary" onClick={() => setStatuses([l.id], "hidden")} className="!rounded-full !px-3 !py-1 text-xs" aria-label={`Hide ${l.business_name}`}>Hide</Button>}
                  </div>
                  <Link to={`/admin/listings/${l.id}`} aria-label={`Edit ${l.business_name}`}><ChevronRight className="size-5 text-slate-400" aria-hidden /></Link>
                </li>
              ))}
            </ul>
            {filtered.length > shown.length && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)} className="!rounded-full text-sm">Show {Math.min(PAGE, filtered.length - shown.length)} more</Button>
              </div>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}
