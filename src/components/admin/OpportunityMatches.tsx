import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { DirectoryTabs } from "./DirectoryTabs";
import { PageTitle, Panel } from "./widgets";

interface Bid { id: string; title: string; agency: string | null; city: string | null; state: string | null; response_due: string | null; posted_at: string | null; naics: string | null }
interface Permit { id: string; summary: string; city: string; zip: string | null; issued_on: string | null; permit_type: string | null; contractor_name: string | null }
interface Match { source: "listing" | "vendor"; id: string; name: string; city: string | null; state: string | null; phone: string | null; email: string | null; claimed: boolean; listing_id: string | null; slug: string | null; score: number | null; reasons: string[] | null }

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "no date");

/** Admin > Directory > Bids & permits: every government bid and permit, with the local contractors and government vendors that match it. */
export function OpportunityMatches() {
  const supabase = getSupabaseBrowser();
  const [kind, setKind] = useState<"bid" | "permit">("bid");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const bids = useLiveQuery<Bid[]>([], () => supabase.from("gov_bids").select("id,title,agency,city,state,response_due,posted_at,naics").order("posted_at", { ascending: false, nullsFirst: false }).limit(500), { key: "opp-bids", intervalMs: null });
  const permits = useLiveQuery<Permit[]>([], () => supabase.from("public_permits").select("id,summary,city,zip,issued_on,permit_type,contractor_name").order("issued_on", { ascending: false, nullsFirst: false }).limit(500), { key: "opp-permits", intervalMs: null });
  // How many government vendors are matched to each item (cheap to count here; local contractors are looked up when a row is opened).
  const vendorCounts = useLiveQuery<Record<string, number>>({}, async () => {
    const out: Record<string, number> = {};
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.from("vendor_matches").select("bid_id,permit_id").range(from, from + 999);
      if (error) return { data: null, error };
      for (const r of data) { const k = r.bid_id ?? r.permit_id; if (k) out[k] = (out[k] ?? 0) + 1; }
      if (data.length < 1000) break;
    }
    return { data: out, error: null };
  }, { key: "opp-vendor-counts", intervalMs: null });

  const q = search.trim().toLowerCase();
  const bidRows = useMemo(() => bids.data.filter((b) => !q || `${b.title} ${b.agency ?? ""} ${b.city ?? ""}`.toLowerCase().includes(q)), [bids.data, q]);
  const permitRows = useMemo(() => permits.data.filter((p) => !q || `${p.summary} ${p.city} ${p.contractor_name ?? ""}`.toLowerCase().includes(q)), [permits.data, q]);

  return (
    <div>
      <DirectoryTabs />
      <PageTitle title="Bids & permits" description="Every government bid and building permit we have collected. Open one to see the local contractors in its area (claimed or not) and the government vendors matched to it by trade code." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["bid", "permit"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setOpenId(null); }}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${kind === k ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            {k === "bid" ? `Government bids (${bids.data.length})` : `Permits (${permits.data.length})`}
          </button>
        ))}
        <input className={`${inputClass} max-w-xs`} placeholder="Search title, agency or city" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Panel title={kind === "bid" ? "Government bids" : "Building permits"}>
        {(kind === "bid" ? bids.loading : permits.loading) ? <p className="text-sm text-slate-500">Loading...</p> : (
          <ul className="divide-y divide-slate-100">
            {kind === "bid" && bidRows.map((b) => (
              <Row key={b.id} id={b.id} kind="bid" open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)}
                title={b.title} meta={[b.agency, [b.city, b.state].filter(Boolean).join(", "), b.naics ? `NAICS ${b.naics}` : null, b.response_due ? `due ${day(b.response_due)}` : `posted ${day(b.posted_at)}`]}
                vendors={vendorCounts.data[b.id] ?? 0} />
            ))}
            {kind === "permit" && permitRows.map((p) => (
              <Row key={p.id} id={p.id} kind="permit" open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                title={p.summary} meta={[p.permit_type, `${p.city}, TX`, p.zip, `issued ${day(p.issued_on)}`]} vendors={vendorCounts.data[p.id] ?? 0} />
            ))}
            {(kind === "bid" ? bidRows : permitRows).length === 0 && <li className="py-6 text-center text-sm text-slate-500">Nothing found.</li>}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Row({ id, kind, title, meta, vendors, open, onToggle }: { id: string; kind: "bid" | "permit"; title: string; meta: (string | null | undefined)[]; vendors: number; open: boolean; onToggle: () => void }) {
  return (
    <li className="py-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 text-left">
        {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-500" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy">{title}</span>
          <span className="block text-xs text-slate-500">{meta.filter(Boolean).join(" · ")}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{vendors} vendors</span>
      </button>
      {open && <Matches kind={kind} id={id} />}
    </li>
  );
}

function Matches({ kind, id }: { kind: "bid" | "permit"; id: string }) {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<{ rows: Match[]; ready: boolean } | null>(null, async () => {
    const { data, error } = await supabase.rpc("admin_opportunity_matches", { p_kind: kind, p_item: id });
    return { data: { rows: (data ?? []) as Match[], ready: !error }, error: null };
  }, { key: `opp-${kind}-${id}`, intervalMs: null });

  if (!q.data) return <p className="mt-2 pl-6 text-sm text-slate-500">Loading matches...</p>;
  if (!q.data.ready) return <p className="mt-2 ml-6 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Run supabase/update-2026-11-25-admin-listing-opportunities.sql in the Supabase SQL Editor to see matches.</p>;
  const locals = q.data.rows.filter((r) => r.source === "listing");
  const vendors = q.data.rows.filter((r) => r.source === "vendor");
  return (
    <div className="mt-3 grid gap-4 pl-6 lg:grid-cols-2">
      <Group title={`Local contractors in the area (${locals.length})`} empty="No published listing reaches this place (check city, service areas and ZIP radius)." rows={locals} />
      <Group title={`Government vendors matched by trade code (${vendors.length})`} empty="No government vendor matched this one." rows={vendors} />
    </div>
  );
}

function Group({ title, rows, empty }: { title: string; rows: Match[]; empty: string }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold tracking-wide text-slate-500 uppercase">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-slate-500">{empty}</p> : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li key={`${r.source}-${r.id}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {r.listing_id ? <Link to={`/admin/listings/${r.listing_id}`} className="font-semibold text-primary hover:underline">{r.name}</Link> : <span className="font-semibold text-navy">{r.name}</span>}
                <span className="text-slate-500">{[r.city, r.state].filter(Boolean).join(", ")}</span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${r.claimed ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>{r.claimed ? "Claimed" : "Unclaimed"}</span>
                {r.score != null && <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">Score {r.score}</span>}
              </div>
              <div className="mt-0.5 text-slate-600">{[r.phone, r.email].filter(Boolean).join(" · ") || "No contact on file"}</div>
              {r.reasons && r.reasons.length > 0 && <div className="mt-0.5 text-slate-500">{r.reasons.join("; ")}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
