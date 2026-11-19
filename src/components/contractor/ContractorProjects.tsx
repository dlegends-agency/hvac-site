import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import { PageTitle, Panel, StatStrip } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useContractor } from "./context";
import { KIND_LABEL, KIND_STYLE, STAGE_LABEL, STAGE_STYLE, stagesFor, type PipelineRow, useLeadHub } from "./useLeadHub";

const money = (n: number | null) => (n === null ? "" : `$${Number(n).toLocaleString("en-US")}`);

/** One project or bid: where it stands, what you quoted, when it is due and your notes. Changes save with the button. */
function Editor({ row, onSave, onRemove }: { row: PipelineRow; onSave: (patch: Partial<Pick<PipelineRow, "stage" | "note" | "amount_usd" | "due_on">>) => Promise<boolean>; onRemove: () => Promise<boolean> }) {
  const [stage, setStage] = useState(row.stage);
  const [amount, setAmount] = useState(row.amount_usd === null ? "" : String(row.amount_usd));
  const [due, setDue] = useState(row.due_on ?? "");
  const [note, setNote] = useState(row.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = `${row.kind}-${row.item_id}`;
  const dirty = stage !== row.stage || amount !== (row.amount_usd === null ? "" : String(row.amount_usd)) || due !== (row.due_on ?? "") || note !== (row.note ?? "");

  async function save() {
    const n = amount.trim() === "" ? null : Number(amount.replace(/[$,\s]/g, ""));
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setMsg({ ok: false, text: "Enter the amount as a number, for example 4500." });
    setBusy(true);
    setMsg(null);
    const ok = await onSave({ stage, amount_usd: n, due_on: due || null, note: note.trim() || null });
    setBusy(false);
    setMsg(ok ? { ok: true, text: "Saved." } : { ok: false, text: "Could not save. Please try again." });
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-sm font-semibold text-navy" id={`stage-${id}`}>Status</p>
      <div role="group" aria-labelledby={`stage-${id}`} className="mt-2 flex flex-wrap gap-1.5">
        {stagesFor(row.kind).filter((s) => s !== "saved").map((s) => (
          <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)}
            className={`rounded-full border px-3.5 py-1 text-sm font-semibold ${stage === s ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy hover:bg-slate-50"}`}>{STAGE_LABEL[s]}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`amt-${id}`} className="mb-1 block text-sm font-semibold text-navy">{row.kind === "bid" ? "Bid amount (US$)" : "Quote (US$)"}</label>
          <input id={`amt-${id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="For example 4500" className={inputClass} />
        </div>
        <div>
          <label htmlFor={`due-${id}`} className="mb-1 block text-sm font-semibold text-navy">{row.kind === "bid" ? "Response due" : "Follow up by"}</label>
          <input id={`due-${id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
        </div>
      </div>
      <label htmlFor={`note-${id}`} className="mt-3 mb-1 block text-sm font-semibold text-navy">Notes <span className="font-normal text-slate-500">(only you can see these)</span></label>
      <textarea id={`note-${id}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who you spoke to, what was agreed, next step…" className={inputClass} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={busy || !dirty} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
        <button type="button" onClick={() => void onRemove()} className="text-sm font-medium text-slate-500 hover:text-red-700">Remove from my list</button>
        <span role="status" className={`text-sm ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</span>
      </div>
    </div>
  );
}

function Card({ row, title, place, onSave, onRemove }: { row: PipelineRow; title: string; place: string | null; onSave: Parameters<typeof Editor>[0]["onSave"]; onRemove: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[row.kind]}`}>{KIND_LABEL[row.kind]}</span>
          <span className="mt-1.5 block font-semibold text-navy">{title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {place}</span>}
            {row.amount_usd !== null && <span className="font-semibold text-slate-700">{row.kind === "bid" ? "Bid" : "Quote"} {money(row.amount_usd)}</span>}
            {row.due_on && <span>{row.kind === "bid" ? "Due" : "Follow up"} {new Date(`${row.due_on}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STAGE_STYLE[row.stage]}`}>{STAGE_LABEL[row.stage]}</span>
      </button>
      {open && (
        <>
          <Editor row={row} onSave={onSave} onRemove={onRemove} />
          <Link to={`/contractor/leads?open=${row.kind}:${row.item_id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">View the lead details <ArrowRight className="size-4" aria-hidden /></Link>
        </>
      )}
    </li>
  );
}

/**
 * Projects and Bids: everything the business started working on from My Leads, with its status, the quote or bid amount, a date and notes.
 * "Projects" holds customer requests and permits, "Bids" the government bids.
 */
export default function ContractorProjects() {
  const { listing } = useContractor();
  const hub = useLeadHub(listing);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "bids" ? "bids" : "projects";
  const mine = hub.pipeline.filter((r) => r.stage !== "saved");
  const projects = mine.filter((r) => r.kind !== "bid");
  const bids = mine.filter((r) => r.kind === "bid");
  const list = tab === "bids" ? bids : projects;
  const [stageFilter, setStageFilter] = useState<"all" | PipelineRow["stage"]>("all");
  const shown = list.filter((r) => stageFilter === "all" || r.stage === stageFilter);
  const count = (rows: PipelineRow[], s: PipelineRow["stage"]) => rows.filter((r) => r.stage === s).length;

  if (!listing) {
    return (
      <>
        <PageTitle title="Projects & bids" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  const byKey = new Map(hub.items.map((i) => [i.key, i]));
  const stages = tab === "bids" ? stagesFor("bid") : stagesFor("lead");

  return (
    <>
      <PageTitle title="Projects & bids" description="Everything you are working on, with its status. Start a project from My Leads once a lead is unlocked." />

      <StatStrip items={tab === "bids" ? [
        { label: "Bids in progress", value: bids.filter((r) => !["won", "lost"].includes(r.stage)).length },
        { label: "Bids submitted", value: count(bids, "submitted") },
        { label: "Won", value: count(bids, "won"), tone: count(bids, "won") > 0 ? "good" : undefined },
        { label: "Lost", value: count(bids, "lost") },
      ] : [
        { label: "Active projects", value: projects.filter((r) => !["won", "lost"].includes(r.stage)).length },
        { label: "Quoted", value: count(projects, "quoted") },
        { label: "Won", value: count(projects, "won"), tone: count(projects, "won") > 0 ? "good" : undefined },
        { label: "Lost", value: count(projects, "lost") },
      ]} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Projects or bids" className="flex gap-1.5">
          {([["projects", `Projects (${projects.length})`], ["bids", `Bids (${bids.length})`]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setStageFilter("all"); setParams(id === "bids" ? { tab: "bids" } : {}, { replace: true }); }}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === id ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy hover:bg-slate-50"}`}>{label}</button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm font-medium text-slate-700">Status
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">All</option>
            {stages.filter((s) => s !== "saved").map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      {hub.pipelineError ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Projects could not be loaded. Run <code>supabase/schema-revamp.sql</code> in the Supabase SQL Editor.</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-navy">{list.length === 0 ? (tab === "bids" ? "No bids yet" : "No projects yet") : "Nothing with that status"}</p>
          <p className="mt-2 text-sm text-slate-600">Save a lead on the Leads page, unlock it in My Leads, then choose <strong>Start project</strong>.</p>
          <Link to="/contractor/my-leads" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Open My Leads <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {shown.map((r) => {
            const item = byKey.get(`${r.kind}:${r.item_id}`);
            return <Card key={`${r.kind}:${r.item_id}`} row={r} title={item?.title ?? r.title} place={item?.place ?? r.place} onSave={(p) => hub.update(r, p)} onRemove={() => hub.remove(r)} />;
          })}
        </ul>
      )}
    </>
  );
}
