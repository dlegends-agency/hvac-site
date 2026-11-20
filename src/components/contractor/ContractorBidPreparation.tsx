import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, ArrowRight, FilePlus2, FileWarning, Loader2, Lock, MapPin, Plus } from "lucide-react";
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
    <form onSubmit={(e) => void submit(e)} className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <p className="text-sm font-semibold text-navy sm:col-span-2">Add a solicitation (RFP, RFQ, ITB or notice)</p>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">Bid title<input name="title" required maxLength={300} className={`${inputClass} mt-1 !py-2`} placeholder="Replace chillers, Fort Hood" /></label>
      <label className="text-sm font-medium text-slate-700">Issuing agency <span className="font-normal text-slate-500">(optional)</span><input name="agency" maxLength={200} className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Solicitation number <span className="font-normal text-slate-500">(optional)</span><input name="number" maxLength={120} className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Place of performance <span className="font-normal text-slate-500">(optional)</span><input name="location" maxLength={300} className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Submission deadline <span className="font-normal text-slate-500">(optional)</span><input name="due" type="date" className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700">Document type
        <select name="type" defaultValue="Solicitation" className={`${inputClass} mt-1 !py-2`}>{["RFP", "RFQ", "ITB", "Solicitation", "Specification"].map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label className="text-sm font-medium text-slate-700">Upload the document <span className="font-normal text-slate-500">(PDF or text)</span><input name="file" type="file" accept=".pdf,.txt,.md,.csv,.html,.htm,application/pdf,text/*" className={`${inputClass} mt-1 !py-2`} /></label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">…or paste its text <span className="font-normal text-slate-500">(for a Word file or a scan)</span><textarea name="paste" rows={4} maxLength={120000} className={`${inputClass} mt-1 !py-2`} /></label>
      <p className="text-xs text-slate-500 sm:col-span-2">The text is read in your browser and saved with the bid so the AI can analyse it. The file itself is not stored.</p>
      <div className="flex items-center gap-3 sm:col-span-2">
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
  const shown = (rows ?? []).filter((r) => tab === "all" || r.status === tab);
  const soon = (rows ?? []).filter((r) => isOpenBid(r.status) && (daysUntil(r.due_at, now) ?? 99) <= 7 && (daysUntil(r.due_at, now) ?? 99) >= 0);

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

      {soon.length > 0 && (
        <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlarmClock className="size-4" aria-hidden /> Deadlines coming up</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {soon.map((r) => <li key={r.id}><Link to={`/contractor/bid-preparation/${r.id}`} className="font-semibold underline">{r.title}</Link> · {dueLabel(daysUntil(r.due_at, now))} · {BID_STATUS_LABEL[r.status]}</li>)}
          </ul>
        </div>
      )}

      {available.length > 0 && (
        <Panel title={`Government bids you have unlocked (${available.length})`}>
          <ul className="-mx-4 divide-y divide-slate-100">
            {available.slice(0, 8).map((i) => (
              <li key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-navy">{i.subject}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">{i.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {i.place}</span>}{i.fact && <span className="font-semibold text-slate-700">{i.fact}</span>}</p>
                </div>
                <Button onClick={() => void start(i.id)} disabled={starting === i.id} className="!rounded-full !px-4 !py-2 text-sm">{starting === i.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Start bid workspace</Button>
              </li>
            ))}
          </ul>
          {startError && <p role="alert" className="mt-2 text-sm text-red-700">{startError}</p>}
        </Panel>
      )}
      {lockedCount > 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600"><Lock className="size-4" aria-hidden /> {lockedCount} more government {lockedCount === 1 ? "contract is" : "contracts are"} near you. <Link to="/contractor/leads?type=bid" className="font-semibold text-primary underline">Unlock one in Discover Opportunities</Link></p>
      )}

      <div role="tablist" aria-label="Bid status" className="mt-6 mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label} <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${tab === t.id ? "bg-blue-100 text-primary" : "bg-slate-100 text-slate-600"}`}>{rows ? counts[t.id] : "…"}</span>
          </button>
        ))}
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
        <ul className="grid gap-3">
          {shown.map((r) => {
            const d = daysUntil(r.due_at, now);
            return (
              <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${BID_STATUS_STYLE[r.status]}`}>{BID_STATUS_LABEL[r.status]}</span>
                      {changed.has(r.id) && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-900"><FileWarning className="size-3" aria-hidden /> Notice changed</span>}
                    </p>
                    <h2 className="mt-1.5 text-base font-bold text-navy"><Link to={`/contractor/bid-preparation/${r.id}`} className="hover:text-primary">{r.title}</Link></h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {r.agency && <span>{r.agency}</span>}
                      {r.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {r.location}</span>}
                      {r.source && <span>Source: {r.source}</span>}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className={`font-bold ${isOpenBid(r.status) && d !== null && d <= 3 ? "text-emergency" : "text-navy"}`}>{dueLabel(d)}</p>
                    <p className="text-xs text-slate-500">{r.contract_value !== null ? `Value ${usd(r.contract_value)}` : "Value not set"}</p>
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3 text-right">
                  <Link to={`/contractor/bid-preparation/${r.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Open workspace <ArrowRight className="size-4" aria-hidden /></Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
