import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useLiveQuery } from "@/lib/admin-hooks";
import { TIERS, ageText, scorePermit, type Coverage, type Scored, type Tier } from "@/lib/permit-score";
import { PERMIT_CLASS_STYLE, permitTitle, permitValue, type PublicPermit } from "@/lib/permits";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle } from "./widgets";

const TIER_STYLE: Record<Tier, { bar: string; score: string; head: string }> = {
  hot: { bar: "border-l-red-500", score: "text-red-600", head: "text-red-600" },
  warm: { bar: "border-l-amber-400", score: "text-amber-500", head: "text-amber-500" },
  cold: { bar: "border-l-sky-400", score: "text-sky-500", head: "text-sky-500" },
};

interface Row {
  p: PublicPermit;
  s: Scored;
}

function Card({ row, tier }: { row: Row; tier: Tier }) {
  const { p, s } = row;
  const style = TIER_STYLE[tier];
  return (
    <li className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${style.bar}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-navy">{permitTitle(p)}</p>
          <p className="text-sm text-slate-600">{permitValue(p.value_usd)} · {ageText(s.ageDays)}</p>
        </div>
        <p className={`text-3xl leading-none font-extrabold ${style.score}`} aria-label={`Score ${s.score}`}>{s.score}</p>
      </div>
      <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600"><span className="font-semibold text-slate-700">Why:</span> {s.why}</p>
      <p className="mt-2 text-sm text-slate-800">{p.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${PERMIT_CLASS_STYLE[p.property_class]}`}>{p.property_class}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{p.city}{p.zip ? ` ${p.zip}` : ""}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {p.address ? `${p.address} · ` : ""}{p.permit_type ?? "Permit"} · #{p.source_id}
        {p.contractor_name && <> · Contractor: {p.contractor_name}</>}
        {p.source_url && <> · <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">City record <ExternalLink className="size-3" aria-hidden /></a></>}
      </p>
    </li>
  );
}

/** HVAC permits from city open-data portals, ranked Hot, Warm and Cold, kept apart from the directory and customer requests. */
export function PermitsAdmin() {
  const supabase = getSupabaseBrowser();
  const [city, setCity] = useState("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");

  const permits = useLiveQuery<PublicPermit[]>(
    [],
    () => supabase.from("public_permits").select("*").eq("trade", "HVAC").order("issued_on", { ascending: false, nullsFirst: false }).limit(1000),
    { key: "permits-hvac", intervalMs: 120_000 },
  );
  // Where we have contractors: the cities of published directory listings.
  const served = useLiveQuery<{ city: string | null }[]>([], () => supabase.from("listings").select("city").eq("status", "published").limit(5000), { key: "permits-served", intervalMs: null });
  const cover = useMemo<Coverage>(() => ({ cities: new Set(served.data.map((l) => (l.city ?? "").trim().toLowerCase()).filter(Boolean)), stateCovered: served.data.length > 0 }), [served.data]);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return permits.data
      .filter((p) => (city === "all" || p.city === city) && (kind === "all" || p.property_class === kind) && (!term || `${p.summary} ${p.address ?? ""} ${p.contractor_name ?? ""} ${p.source_id}`.toLowerCase().includes(term)))
      .map((p) => ({ p, s: scorePermit(p, cover) }))
      .sort((a, b) => b.s.score - a.s.score || (b.p.issued_on ?? "").localeCompare(a.p.issued_on ?? ""));
  }, [permits.data, cover, city, kind, q]);
  const cityList = [...new Set(permits.data.map((p) => p.city))].sort();
  const latest = permits.data.reduce((m, p) => (p.imported_at > m ? p.imported_at : m), "");

  return (
    <>
      <PageTitle title="Permits" />
      <p className="mb-5 max-w-4xl text-sm text-slate-600">
        New <strong>HVAC</strong> permits from city open-data portals, scraped every day at 8:00 AM Philippine time. Each one is scored from 0 to 100: how fresh it is (35), its project value (25),
        the kind and size of the job (20) and whether we have contractors in that city (20). <strong>Hot</strong> is 65 or more, <strong>Warm</strong> is 35 to 64, <strong>Cold</strong> is under 35.
        Most cities leave the value blank on HVAC permits, so many show &quot;Value not listed&quot; and are ranked on the other parts.
        This is public record data kept for your research. Nothing is sent to anyone from here.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-700">City
          <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">All cities</option>
            {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">Property
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">Residential and commercial</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label className="sr-only" htmlFor="permit-q">Search permits</label>
        <input id="permit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address, contractor, permit #" className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-1.5 sm:w-72" />
        <span className="text-xs text-slate-500">{rows.length} permits{latest ? ` · last scrape ${new Date(latest).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
      </div>

      {permits.error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Permits could not be loaded. Run <code>supabase/schema-permits.sql</code> in the Supabase SQL Editor.</p>
      ) : permits.data.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No permits yet. Run the permits import (GitHub Actions &gt; Permits import &gt; Run workflow). After that it runs by itself every day.</p>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-3">
          {(["hot", "warm", "cold"] as Tier[]).map((tier) => {
            const list = rows.filter((r) => r.s.tier === tier);
            return (
              <section key={tier} aria-label={TIERS[tier].label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className={`text-2xl font-extrabold tracking-tight uppercase ${TIER_STYLE[tier].head}`}>{TIERS[tier].label} <span className="text-base font-semibold text-slate-500">({list.length})</span></h2>
                  <span className="text-xs text-slate-500">{TIERS[tier].hint}</span>
                </div>
                {list.length === 0 ? <p className="text-sm text-slate-500">None right now.</p> : (
                  <ul className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                    {list.slice(0, 60).map((r) => <Card key={r.p.id} row={r} tier={tier} />)}
                    {list.length > 60 && <li className="text-center text-xs text-slate-500">Showing the top 60 of {list.length}. Use the filters to narrow it down.</li>}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
