import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, ArrowRight, Building2, CalendarClock, FilePlus2, FileWarning, Loader2, Lock, MapPin, Plus, Search } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { BID_STATUSES, BID_STATUS_LABEL, BID_STATUS_STYLE, daysUntil, dueLabel, isOpenBid, type BidStatus, type BidWorkspace } from "@/lib/bidprep";
import { extractText } from "@/lib/extract-text";
import { usd } from "@/lib/projects";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useContractor } from "./context";
import { useLeadHub } from "./useLeadHub";

type TabId = "all" | BidStatus;
/** The usual path of a bid, for the progress bar on each card. */
const FLOW: BidStatus[] = BID_STATUSES.filter((s) => s !== "lost" && s !== "expired");
const TABS: { id: TabId; label: string }[] = [{ id: "all", label: "All bids" }, ...BID_STATUSES.map((s) => ({ id: s as TabId, label: BID_STATUS_LABEL[s] }))];

function AddSolicitation({ listingId, onCancel }: { listingId: string; onCancel: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      const file = f.get("file");
      let text = String(f.get("paste") ?? "").trim();
      let docName = "Pasted solicitation text";
      if (file instanceof File && file.size > 0) {
        const read = await extractText(file);
        text = read.text;
        docName = file.name;
      }
      const sb = getSupabaseBrowser();
      const due = String(f.get("due") ?? "");
      const { data, error: err } = await sb.from("bid_workspaces").insert({
        listing_id: listingId, title, agency: String(f.get("agency") ?? "").trim() || null, solicitation_number: String(f.get("number") ?? "").trim() || null,
        location: String(f.get("location") ?? "").trim() || null, source: "Uploaded by you", due_at: due ? new Date(`${due}T17:00:00`).toISOString() : null,
      }).select("id").single();
      if (err || !data) throw new Error("The bid could not be created. Has supabase/schema-bidprep.sql been run?");
      const id = (data as { id: string }).id;
      if (text) await sb.from("bid_documents").insert({ workspace_id: id, name: docName, doc_type: String(f.get("type") ?? "Solicitation"), extracted_text: text });
      navigate(`/contractor/bid-preparation/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <p className="text-sm font-bold text-navy sm:col-span-2 lg:col-span-4">Add a solicitation (RFP, RFQ, ITB or notice)</p>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-4">Bid title<input name="title" required maxLength={300} className={`${inputClass} mt-1 !py-2`} placeholder="Replace chillers, Fort Hood" /></label>
      <label className="text-sm font-medium text-slate-700">Issuing agency <span className="font-normal text-slate-500">(optional)</span><input name="agency" maxLength={200} className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Solicitation number <span className="font-normal text-slate-500">(optional)</span><input name="number" maxLength={120} className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Place of performance <span className="font-normal text-slate-500">(optional)</span><input name="location" maxLength={300} className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Submission deadline <span className="font-normal text-slate-500">(optional)</span><input name="due" type="date" className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Document type
        <select name="type" defaultValue="Solicitation" className={`${inputClass} mt-1 !py-2`}>{["RFP", "RFQ", "ITB", "Solicitation", "Specification"].map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="text-sm font-medium text-slate-700">Upload the document <span className="font-normal text-slate-500">(PDF or text)</span><input name="file" type="file" accept=".pdf,.txt,.md,.csv,.html,.htm,application/pdf,text/*" className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-4">…or paste its text <span className="font-normal text-slate-500">(for a Word file or a scan)</span><textarea name="paste" rows={4} maxLength={120000} className={`${inputClass} mt-1 !py-2`} /></label>
      <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">The text is read in your browser and saved with the bid so the AI can analyse it. The file itself is not stored.</p>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Create bid workspace</Button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-600 underline">Cancel</button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}

/** Bid Preparation: every government solicitation you are going after, from notice to award, with deadline reminders. */
export default function ContractorBidPreparation() {
  const { listing } = useContractor();
  const navigate = useNavigate();
  const hub = useLeadHub(listing);
  const [rows, setRows] = useState<BidWorkspace[] | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<TabId>("all");
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    await sb.rpc("refresh_bid_deadlines"); // a deadline that has passed marks the open bid Expired
    const [w, c] = await Promise.all([sb.from("bid_workspaces").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(300), sb.rpc("my_bid_source_changes")]);
    setError(Boolean(w.error));
    setRows((w.data as BidWorkspace[] | null) ?? []);
    setChanged(new Set(((c.data as { workspace_id: string }[] | null) ?? []).map((x) => x.workspace_id)));
  }, []);
  useEffect(() => {
    if (!listing) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [listing, load]);

  const startedBids = useMemo(() => new Set((rows ?? []).filter((r) => r.gov_bid_id).map((r) => r.gov_bid_id)), [rows]);
  const available = hub.items.filter((i) => i.kind === "bid" && i.unlocked && !startedBids.has(i.id));
  const lockedCount = hub.items.filter((i) => i.kind === "bid" && !i.unlocked).length;
  const counts = useMemo(() => {
    const c = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<TabId, number>;
    for (const r of rows ?? []) { c.all++; c[r.status]++; }
    return c;
  }, [rows]);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => (tab === "all" || r.status === tab) && (!q || `${r.title} ${r.agency ?? ""} ${r.solicitation_number ?? ""} ${r.location ?? ""}`.toLowerCase().includes(q)));
  const soon = (rows ?? []).filter((r) => isOpenBid(r.status) && (daysUntil(r.due_at, now) ?? 99) <= 7 && (daysUntil(r.due_at, now) ?? 99) >= 0);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const open = all.filter((r) => isOpenBid(r.status));
    return {
      open: open.length,
      soon: open.filter((r) => { const d = daysUntil(r.due_at, now); return d !== null && d >= 0 && d <= 7; }).length,
      review: all.filter((r) => ["internal_review", "approved"].includes(r.status)).length,
      won: all.filter((r) => r.status === "awarded").length,
      value: all.filter((r) => r.status === "awarded").reduce((t, r) => t + Number(r.contract_value ?? 0), 0),
    };
  }, [rows, now]);

  async function start(bidId: string) {
    setStarting(bidId);
    setStartError(null);
    const { data, error: err } = await getSupabaseBrowser().rpc("start_bid_workspace", { p_bid: bidId });
    setStarting(null);
    if (err || typeof data !== "string") return setStartError(err?.message.includes("function") ? "Bid Preparation is not set up yet. Run supabase/schema-bidprep.sql." : (err?.message ?? "That did not work."));
    navigate(`/contractor/bid-preparation/${data}`);
  }

  if (!listing) {
    return (
      <>
        <PageTitle title="Bid Preparation" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Bid Preparation" description="Go after government contracts step by step: read the solicitation, check you qualify, prepare and approve a proposal, then track the bid to the award. You always make the final decision and submit on the agency's own site.">
        <Button onClick={() => setAdding((a) => !a)} variant="secondary" className="!rounded-full text-sm"><FilePlus2 className="size-4" aria-hidden /> Add a solicitation</Button>
      </PageTitle>
      {adding && <AddSolicitation listingId={listing.id} onCancel={() => setAdding(false)} />}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Open bids", value: rows ? stats.open : "…", hint: "Being worked on", tone: "border-blue-200 bg-blue-50/60" },
          { label: "Due within 7 days", value: rows ? stats.soon : "…", hint: "Needs attention first", tone: stats.soon ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white" },
          { label: "Ready for a decision", value: rows ? stats.review : "…", hint: "Internal review or approved", tone: "border-amber-200 bg-amber-50/60" },
          { label: "Awarded", value: rows ? stats.won : "…", hint: rows ? usd(stats.value) : "", tone: "border-emerald-200 bg-emerald-50/60" },
        ].map((t) => (
          <div key={t.label} className={`rounded-2xl border p-3.5 ${t.tone}`}><p className="text-xs font-semibold text-slate-600">{t.label}</p><p className="mt-0.5 text-xl font-extrabold text-navy">{t.value}</p><p className="text-xs text-slate-600">{t.hint}</p></div>
        ))}
      </div>

      {soon.length > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="inline-flex items-center gap-2 font-bold"><AlarmClock className="size-4" aria-hidden /> Deadlines coming up</span>
          {soon.map((r) => <span key={r.id}><Link to={`/contractor/bid-preparation/${r.id}`} className="font-semibold underline">{r.title.length > 50 ? `${r.title.slice(0, 50)}…` : r.title}</Link> · {dueLabel(daysUntil(r.due_at, now))}</span>)}
        </div>
      )}

      {available.length > 0 && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-navy">Unlocked and ready to start ({available.length})</h2>
            {lockedCount > 0 && <Link to="/contractor/leads?type=bid" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Lock className="size-3" aria-hidden /> {lockedCount} more near you</Link>}
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {available.slice(0, 8).map((i) => (
              <li key={i.key} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-navy">{i.subject}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">{i.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden /> {i.place}</span>}{i.fact && <span className="font-semibold text-slate-700">{i.fact}</span>}</p>
                </div>
                <Button onClick={() => void start(i.id)} disabled={starting === i.id} className="shrink-0 !rounded-full !px-3.5 !py-1.5 text-xs">{starting === i.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} Start</Button>
              </li>
            ))}
          </ul>
          {startError && <p role="alert" className="mt-2 text-sm text-red-700">{startError}</p>}
        </section>
      )}
      {available.length === 0 && lockedCount > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-slate-600"><Lock className="size-4" aria-hidden /> {lockedCount} government {lockedCount === 1 ? "contract is" : "contracts are"} near you. <Link to="/contractor/leads?type=bid" className="font-semibold text-primary underline">Unlock one in Discover Opportunities</Link></p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Bid status" className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
              {t.label} <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${tab === t.id ? "bg-blue-100 text-primary" : "bg-slate-100 text-slate-600"}`}>{rows ? counts[t.id] : "…"}</span>
            </button>
          ))}
        </div>
        <label className="relative">
          <span className="sr-only">Search bids</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bids" className="w-48 rounded-full border border-slate-300 bg-white py-1.5 pr-3 pl-9 text-sm" />
        </label>
      </div>

      {error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Bids could not be loaded. Run <code>supabase/schema-bidprep.sql</code> in the Supabase SQL Editor.</p>
      ) : rows === null ? (
        <p className="text-slate-600">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-navy">{rows.length === 0 ? "No bids yet" : "Nothing in this tab"}</p>
          <p className="mt-2 text-sm text-slate-600">{rows.length === 0 ? "Unlock a government contract and start a workspace for it, or add a solicitation you already have." : "Change a bid's status and it moves between tabs."}</p>
          {rows.length === 0 && <Link to="/contractor/leads?type=bid" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Discover government contracts <ArrowRight className="size-4" aria-hidden /></Link>}
        </div>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {shown.map((r) => {
            const d = daysUntil(r.due_at, now);
            const at = FLOW.indexOf(r.status);
            const urgent = isOpenBid(r.status) && d !== null && d >= 0 && d <= 3;
            return (
              <li key={r.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${BID_STATUS_STYLE[r.status]}`}>{BID_STATUS_LABEL[r.status]}</span>
                      {changed.has(r.id) && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-900"><FileWarning className="size-3" aria-hidden /> Notice changed</span>}
                    </p>
                    <h2 className="mt-1.5 line-clamp-2 text-base font-bold text-navy" title={r.title}><Link to={`/contractor/bid-preparation/${r.id}`} className="hover:text-primary">{r.title}</Link></h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {r.agency && <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" aria-hidden /> {r.agency}</span>}
                      {r.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {r.location}</span>}
                      {r.solicitation_number && <span>#{r.solicitation_number}</span>}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className={`inline-flex items-center gap-1 font-bold ${urgent ? "text-emergency" : "text-navy"}`}><CalendarClock className="size-3.5" aria-hidden /> {dueLabel(d)}</p>
                    <p className="text-xs text-slate-500">{r.contract_value !== null ? `Value ${usd(r.contract_value)}` : "Value not set"}</p>
                  </div>
                </div>
                <ol className="mt-3 flex gap-1" aria-label="Progress">
                  {FLOW.map((s, i) => <li key={s} title={BID_STATUS_LABEL[s]} className={`h-1.5 flex-1 rounded-full ${at < 0 ? "bg-slate-200" : i <= at ? "bg-primary" : "bg-slate-200"}`} />)}
                </ol>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">{r.source ?? ""}</span>
                  <Link to={`/contractor/bid-preparation/${r.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">Open workspace <ArrowRight className="size-4" aria-hidden /></Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
