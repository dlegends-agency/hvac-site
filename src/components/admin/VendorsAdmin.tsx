import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ExternalLink, Info, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { GovVendor, VendorMatch, VendorSyncRun } from "@/lib/types";
import { DirectoryTabs } from "./DirectoryTabs";
import { PageTitle, Panel, StatCard } from "./widgets";

const SOURCE: Record<string, string> = { cmbl: "Texas CMBL", sba: "SBA", sam: "SAM.gov" };
const STATUS: Record<string, string> = { new: "New", matched: "Matched", imported: "Imported (unclaimed)", merged: "Already in directory", rejected: "Rejected" };
const STAGE: Record<string, string> = { cmbl: "Texas CMBL sync", sba: "SBA import", sam: "SAM.gov sync", match: "Matching to bids and permits", import: "Import to directory" };
const PAGE = 50;

/** Admin > Directory > Government vendors: review vendors found in official government files, their matches, and the sync activity. */
export function VendorsAdmin() {
  const supabase = getSupabaseBrowser();
  const vendors = useLiveQuery<GovVendor[]>([], () => supabase.from("gov_vendors").select("*").order("last_changed_at", { ascending: false }).limit(2000), { key: "vendors", intervalMs: 60_000 });
  const matches = useLiveQuery<VendorMatch[]>([], () => supabase.from("vendor_matches").select("id,created_at,score,reasons,gov_vendors(name,city),gov_bids(title,city),public_permits(summary,city)").order("created_at", { ascending: false }).limit(25), { key: "vendor-matches", intervalMs: 60_000 });
  const runs = useLiveQuery<VendorSyncRun[]>([], () => supabase.from("vendor_sync_runs").select("*").order("started_at", { ascending: false }).limit(12), { key: "vendor-runs", intervalMs: 30_000 });
  const counts = useLiveQuery<{ matches: number; unclaimed: number }>({ matches: 0, unclaimed: 0 }, async () => {
    const [m, u] = await Promise.all([
      supabase.from("vendor_matches").select("id", { count: "exact", head: true }),
      supabase.from("listings").select("id", { count: "exact", head: true }).eq("unclaimed", true),
    ]);
    return { data: { matches: m.count ?? 0, unclaimed: u.count ?? 0 }, error: m.error ?? u.error };
  }, { key: "vendor-counts", intervalMs: 60_000 });

  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const notSetUp = vendors.error && !vendors.loading;
  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return vendors.data.filter((v) => (!status || v.status === status) && (!source || v.source === source) && (!t || `${v.name} ${v.city ?? ""} ${v.phone ?? ""} ${v.email ?? ""}`.toLowerCase().includes(t)));
  }, [vendors.data, status, source, search]);
  const tally = (s: string) => vendors.data.filter((v) => v.status === s).length;

  async function act(v: GovVendor, what: "verify" | "reject" | "publish") {
    setBusy(v.id);
    setMsg(null);
    let error: unknown = null;
    if (what === "verify") ({ error } = await supabase.from("gov_vendors").update({ verified_at: new Date().toISOString() }).eq("id", v.id));
    if (what === "reject") ({ error } = await supabase.from("gov_vendors").update({ status: "rejected" }).eq("id", v.id));
    if (what === "publish" && v.listing_id) ({ error } = await supabase.from("listings").update({ status: "published" }).eq("id", v.listing_id).eq("unclaimed", true));
    setBusy(null);
    setMsg(error ? { ok: false, text: "That did not save. Try again." } : { ok: true, text: what === "publish" ? "Published as an unclaimed listing." : what === "verify" ? "Marked as verified." : "Rejected: it will not be imported again." });
    void vendors.reload();
  }

  return (
    <>
      <PageTitle title="Directory" />
      <DirectoryTabs />
      <div className="mb-5 flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          Vendors come from <strong>official files</strong>: the Texas Comptroller&apos;s CMBL downloads, SAM.gov&apos;s API and SBA exports you import. The sync matches them to the open bids and permits already collected (by NAICS and NIGP code, location and set-aside), then adds matches to the directory as <strong>unclaimed, pending</strong> listings.
          No login, plan or lead routing is created for them. A business becomes the owner only through <Link to="/admin/listings/claims" className="font-semibold underline">a claim you approve</Link>.
        </p>
      </div>
      {notSetUp && <p role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Run <code>supabase/schema-vendors.sql</code> in the Supabase SQL Editor to turn this page on.</p>}
      {msg && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Vendors found" value={vendors.data.length.toLocaleString()} />
        <StatCard label="Matched to bids or permits" value={counts.data.matches.toLocaleString()} hint="match records" />
        <StatCard label="Unclaimed listings" value={counts.data.unclaimed.toLocaleString()} />
        <StatCard label="Already in directory" value={tally("merged").toLocaleString()} hint="duplicates linked" />
        <StatCard label="Verified by an admin" value={vendors.data.filter((v) => v.verified_at).length.toLocaleString()} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Sync activity">
          {runs.data.length === 0 ? <p className="text-sm text-slate-500">No sync has run yet. It runs every night (GitHub Actions &gt; Vendor sync).</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {runs.data.map((r) => (
                <li key={r.id} className="py-2.5">
                  <p className="flex flex-wrap items-center gap-x-3">
                    <span className="font-semibold text-navy">{STAGE[r.source] ?? r.source}</span>
                    <span className={r.status === "ok" ? "text-green-700" : r.status ? "text-red-700" : "text-slate-500"}>{r.status ?? "running"}</span>
                    <span className="text-xs text-slate-500">{new Date(r.started_at).toLocaleString()}</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {r.fetched} read · {r.inserted} new · {r.updated} updated · {r.matched} matches · {r.imported} listings created · {r.duplicates} duplicates
                  </p>
                  {r.status && r.status !== "ok" && r.log.length > 0 && <p className="mt-1 text-xs text-red-700">{r.log[r.log.length - 1]}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Latest matches">
          {matches.data.length === 0 ? <p className="text-sm text-slate-500">No matches yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {matches.data.map((m) => (
                <li key={m.id} className="py-2.5">
                  <p><span className="font-semibold text-navy">{m.gov_vendors?.name}</span> <span className="text-slate-500">({m.gov_vendors?.city})</span> <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">{m.score}</span></p>
                  <p className="text-xs text-slate-600">{m.gov_bids ? `Bid: ${m.gov_bids.title}` : `Permit: ${m.public_permits?.summary}`}</p>
                  <p className="text-xs text-slate-500">{m.reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title={`Vendors (${rows.length.toLocaleString()})`}>
          <div className="mb-4 flex flex-wrap gap-2">
            <input aria-label="Search vendors" placeholder="Search name, city, phone, email" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }} className={`${inputClass} !w-64`} />
            <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setVisible(PAGE); }} className={`${inputClass} !w-auto`}>
              <option value="">All statuses</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); setVisible(PAGE); }} className={`${inputClass} !w-auto`}>
              <option value="">All sources</option>
              {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {rows.length === 0 ? <p className="text-sm text-slate-500">{vendors.loading ? "Loading..." : "No vendors match."}</p> : (
            <ul className="space-y-3">
              {rows.slice(0, visible).map((v) => (
                <li key={v.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">
                        {v.name} {v.verified_at && <BadgeCheck className="inline size-4 text-green-600" aria-label="Verified by an admin" />}
                        <span className="ml-2 text-xs font-normal text-slate-500">{SOURCE[v.source]} · {STATUS[v.status]}{!v.active && " · no longer in source file"}</span>
                      </p>
                      <p className="text-sm text-slate-700">{[v.address, v.city, v.state, v.postal_code].filter(Boolean).join(", ")}</p>
                      <p className="text-sm text-slate-700">{[v.phone, v.email, v.website].filter(Boolean).join(" · ") || "No contact details"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {v.nigp_items.length > 0 && <>NIGP {v.nigp_items.filter((i) => /^(910-(36|04|17)|936-67|031-)/.test(i)).join(", ") || v.nigp_items.slice(0, 4).join(", ")} · </>}
                        {v.naics.length > 0 && <>NAICS {v.naics.slice(0, 4).join(", ")} · </>}
                        {v.classifications.length > 0 && <>{v.classifications.join(", ")} · </>}
                        HVAC fit {v.hvac_score} · source updated {v.source_updated_on ?? "n/a"} · first seen {new Date(v.first_seen_at).toLocaleDateString()} · changed {new Date(v.last_changed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {v.listing_id && <Link to={`/admin/listings/${v.listing_id}`} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">Listing <ExternalLink className="size-3.5" aria-hidden /></Link>}
                      {v.status === "imported" && <Button onClick={() => act(v, "publish")} disabled={busy === v.id} className="!rounded-full !px-4 !py-1.5 text-sm">Publish</Button>}
                      {!v.verified_at && <Button onClick={() => act(v, "verify")} disabled={busy === v.id} className="!rounded-full !px-4 !py-1.5 text-sm">Mark verified</Button>}
                      {v.status !== "rejected" && v.status !== "imported" && <button type="button" onClick={() => act(v, "reject")} disabled={busy === v.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><X className="size-4" aria-hidden /> Reject</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {rows.length > visible && <div className="mt-4 text-center"><button type="button" onClick={() => setVisible((n) => n + PAGE)} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-navy hover:bg-slate-50">Show more</button></div>}
        </Panel>
      </div>
    </>
  );
}
