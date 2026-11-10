import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useLiveQuery } from "@/lib/admin-hooks";
import { PERMIT_CLASS_STYLE, PERMIT_TRADES, permitValue, type PublicPermit } from "@/lib/permits";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle, Panel } from "./widgets";

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date");

/** Public building permits pulled from city open-data portals, kept apart from the directory and the customer requests. */
export function PermitsAdmin() {
  const supabase = getSupabaseBrowser();
  const [city, setCity] = useState("all");
  const [trade, setTrade] = useState("all");
  const [kind, setKind] = useState("all");

  const rows = useLiveQuery<PublicPermit[]>(
    [],
    () => {
      let q = supabase.from("public_permits").select("*").order("issued_on", { ascending: false, nullsFirst: false }).limit(300);
      if (city !== "all") q = q.eq("city", city);
      if (trade !== "all") q = q.eq("trade", trade);
      if (kind !== "all") q = q.eq("property_class", kind);
      return q;
    },
    { key: `permits-${city}-${trade}-${kind}`, intervalMs: 60_000 },
  );
  const cities = useLiveQuery<{ city: string }[]>([], () => supabase.from("public_permits").select("city").limit(2000), { key: "permit-cities", intervalMs: null });
  const cityList = [...new Set(cities.data.map((c) => c.city))].sort();
  const total = rows.data.reduce((sum, p) => sum + (p.value_usd ?? 0), 0);

  return (
    <>
      <PageTitle title="Permits" />
      <p className="mb-5 max-w-3xl text-sm text-slate-600">
        Public building permits from city open-data portals. For each one we name the trade, read the project value, mark it residential or commercial and write a one-line summary.
        This is public record data kept for your research. It is separate from the directory and from customer requests, and nothing is sent to anyone from here.
      </p>

      <Panel title="Permits">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 font-medium text-slate-700">City
            <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
              <option value="all">All cities</option>
              {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-700">Trade
            <select value={trade} onChange={(e) => setTrade(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
              <option value="all">All trades</option>
              {PERMIT_TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-700">Property
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
              <option value="all">Residential and commercial</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
            </select>
          </label>
          <span className="text-xs text-slate-500">{rows.data.length} shown · {permitValue(total)} in listed project value</span>
        </div>

        {rows.error ? (
          <p className="text-sm text-orange-900">Permits could not be loaded. Run <code>supabase/schema-permits.sql</code> in the Supabase SQL Editor.</p>
        ) : rows.data.length === 0 ? (
          <p className="text-sm text-slate-500">No permits yet. Run the permits import (see <code>scripts/permits/README.md</code>), or change the filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.data.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-white">{p.trade}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${PERMIT_CLASS_STYLE[p.property_class]}`}>{p.property_class}</span>
                  <span className="text-sm font-bold text-navy">{permitValue(p.value_usd)}</span>
                  <span className="text-xs text-slate-500">{p.city} · {day(p.issued_on)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{p.summary}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                  <span>{p.permit_type ?? "Permit"} · #{p.source_id}</span>
                  {p.contractor_name && <span>Contractor: {p.contractor_name}</span>}
                  {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">City record <ExternalLink className="size-3" aria-hidden /></a>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
