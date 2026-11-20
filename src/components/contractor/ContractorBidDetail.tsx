import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Copy, FileWarning, Loader2, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import {
  BID_STATUSES, BID_STATUS_LABEL, BID_STATUS_STYLE, DOC_TYPES, REQ_CATEGORIES, REQ_GROUP_TITLE, REQ_STATUSES, REQ_STATUS_LABEL, REQ_STATUS_STYLE, daysUntil, dueLabel,
  type BidActivity, type BidAnalysis, type BidDocument, type BidEstimateLine, type BidProposal, type BidRequirement, type BidStatus, type BidWorkspace, type ProposalSection, type ReqStatus,
} from "@/lib/bidprep";
import { extractText } from "@/lib/extract-text";
import { usd } from "@/lib/projects";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";
import { useContractor } from "./context";
import { ago } from "./useMyLeads";
import { useChildRows } from "./useProjects";

const TABS = ["Overview", "Documents", "Analysis & Compliance", "Proposal", "Cost Estimate", "Timeline"] as const;
type Tab = (typeof TABS)[number];
const ORDER_OLD = { column: "created_at", ascending: true };
const input = `${inputClass} !py-2`;
const L = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => (
  <label className={`block text-sm font-medium text-slate-700 ${className}`}>{label}<span className="mt-1 block">{children}</span></label>
);
const ACTIVITY_LABEL: Record<string, string> = { created: "Created", status: "Status", note: "Note", document: "Document", analysis: "Analysis", requirement: "Checklist", proposal: "Proposal", estimate: "Estimate", amendment: "Amendment", converted: "Converted" };
const sb = () => getSupabaseBrowser();

/** What to say when the AI endpoint says no. */
function aiProblem(status: number, error?: string) {
  if (status === 403) return "The AI agent comes with the Featured plan. Upgrade under Subscription & Billing to use it.";
  if (status === 501) return "The AI agent is not switched on yet. Please contact us.";
  if (status === 429) return error ?? "You have reached today's limit for the AI agent. Please try again tomorrow.";
  if (status === 0) return "No connection. Please try again.";
  return error ?? "The AI agent could not answer. Please try again.";
}

function AiNote() {
  return <p className="text-xs text-slate-500">The AI drafts and checks; it never approves or submits anything. It only sees what is in this workspace and your public business profile.</p>;
}

// ---------------------------------------------------------------- overview
function Overview({ ws, blockers, hasApproved, changed, reload }: { ws: BidWorkspace; blockers: number; hasApproved: boolean; changed: boolean; reload: () => void }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BidStatus>(ws.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [value, setValue] = useState(ws.contract_value ? String(ws.contract_value) : "");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const d = daysUntil(ws.due_at, now);

  useEffect(() => {
    if (ws.status !== "awarded") return;
    void sb().from("projects").select("id").eq("bid_workspace_id", ws.id).maybeSingle().then(({ data }) => setProjectId((data as { id: string } | null)?.id ?? null));
  }, [ws.status, ws.id]);

  async function saveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const due = String(f.get("due") ?? "");
    const v = String(f.get("value") ?? "").trim();
    const { error } = await sb().from("bid_workspaces").update({
      title: String(f.get("title") ?? "").trim() || ws.title, agency: String(f.get("agency") ?? "").trim() || null, solicitation_number: String(f.get("number") ?? "").trim() || null,
      location: String(f.get("location") ?? "").trim() || null, contract_value: v ? Number(v) : null, due_at: due ? new Date(`${due}T17:00:00`).toISOString() : null, notes: String(f.get("notes") ?? "").trim() || null,
    }).eq("id", ws.id);
    setBusy(false);
    setMsg(error ? { ok: false, text: "That did not save." } : { ok: true, text: "Saved." });
    if (!error) reload();
  }
  async function changeStatus() {
    setBusy(true);
    setMsg(null);
    const { error } = await sb().from("bid_workspaces").update({ status }).eq("id", ws.id);
    setBusy(false);
    if (error) { setStatus(ws.status); setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "Status updated." });
    reload();
  }
  async function convert() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await sb().rpc("convert_bid_to_project", { p_ws: ws.id, p_contract_value: Number(value) || null });
    setBusy(false);
    if (error || typeof data !== "string") return setMsg({ ok: false, text: error?.message ?? "The project could not be created." });
    navigate(`/contractor/projects/${data}`);
  }
  async function takeNotice() {
    setBusy(true);
    const { error } = await sb().rpc("refresh_bid_source", { p_ws: ws.id });
    setBusy(false);
    if (!error) reload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-5">
        {changed && (
          <div role="alert" className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
            <p className="flex items-center gap-2 font-bold"><FileWarning className="size-4" aria-hidden /> The notice was changed after you started</p>
            <p className="mt-1">The agency may have amended the solicitation or moved the deadline. Update this workspace, then analyse it again and re-check the requirements.</p>
            <Button onClick={() => void takeNotice()} disabled={busy} className="mt-2 !rounded-full !px-4 !py-2 text-sm">Update from the notice</Button>
          </div>
        )}
        <form key={ws.updated_at} onSubmit={(e) => void saveDetails(e)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <L label="Bid title" className="sm:col-span-2"><input name="title" defaultValue={ws.title} maxLength={300} required className={input} /></L>
          <L label="Issuing agency"><input name="agency" defaultValue={ws.agency ?? ""} maxLength={200} className={input} /></L>
          <L label="Solicitation number"><input name="number" defaultValue={ws.solicitation_number ?? ""} maxLength={120} className={input} /></L>
          <L label="Place of performance"><input name="location" defaultValue={ws.location ?? ""} maxLength={300} className={input} /></L>
          <L label="Contract value ($)"><input name="value" type="number" min="0" step="0.01" defaultValue={ws.contract_value ?? ""} className={input} /></L>
          <L label="Submission deadline"><input name="due" type="date" defaultValue={ws.due_at ? ws.due_at.slice(0, 10) : ""} className={input} /></L>
          <p className="self-end pb-2 text-sm text-slate-600">{dueLabel(d)}{ws.source ? ` · Source: ${ws.source}` : ""}</p>
          <L label="Notes" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={ws.notes ?? ""} maxLength={4000} className={input} /></L>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">Save details</Button></div>
        </form>
      </div>

      <div className="space-y-4">
        <Panel title="Bid status">
          <label className="block text-sm font-medium text-slate-700">Move this bid to
            <select value={status} onChange={(e) => setStatus(e.target.value as BidStatus)} disabled={ws.status === "awarded"} className={`${input} mt-1`}>
              {BID_STATUSES.map((s) => <option key={s} value={s}>{BID_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <Button onClick={() => void changeStatus()} disabled={busy || status === ws.status} className="mt-2 !rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Update status</Button>
          <div role="status">{msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
            <li className="flex items-start gap-1.5">{hasApproved ? <Check className="mt-0.5 size-3.5 shrink-0 text-green-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />} {hasApproved ? "A proposal is approved." : "No approved proposal yet. Approved and Submitted need one."}</li>
            <li className="flex items-start gap-1.5">{blockers === 0 ? <Check className="mt-0.5 size-3.5 shrink-0 text-green-600" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />} {blockers === 0 ? "No mandatory requirement is open." : `${blockers} mandatory ${blockers === 1 ? "requirement is" : "requirements are"} not verified. A good AI match does not change that.`}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">&quot;Submitted&quot; means you sent the bid on the agency&apos;s own site. Mark it only after you have.</p>
        </Panel>

        {ws.status === "awarded" && (
          <Panel title="Awarded: make it a project">
            {projectId ? <Link to={`/contractor/projects/${projectId}`} className="font-semibold text-primary hover:underline">View the project</Link> : (
              <>
                <p className="text-sm text-slate-700">The agency, place, scope and documents move across for you.</p>
                <label className="mt-2 block text-sm font-medium text-slate-700">Awarded contract value ($)<input type="number" min="1" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={`${input} mt-1`} /></label>
                <Button onClick={() => void convert()} disabled={busy || !(Number(value) > 0)} className="mt-2 !rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Convert to Project</Button>
              </>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- documents
function Documents({ ws, docs }: { ws: BidWorkspace; docs: ReturnType<typeof useChildRows<BidDocument>> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get("file");
    const paste = String(f.get("paste") ?? "").trim();
    const url = String(f.get("url") ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      let text = paste;
      let name = String(f.get("name") ?? "").trim();
      if (file instanceof File && file.size > 0) { text = (await extractText(file)).text; name = name || file.name; }
      if (!text && !url) throw new Error("Choose a file, paste some text or add a link.");
      if (!name) name = url ? "Linked document" : "Pasted text";
      const ok = await docs.add({ name, doc_type: String(f.get("type")), url: url || null, extracted_text: text || null });
      if (!ok) throw new Error("That did not save.");
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    }
    setBusy(false);
  }
  void ws;
  return (
    <div className="max-w-4xl">
      <form onSubmit={(e) => void addFile(e)} className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <L label="Name"><input name="name" maxLength={200} className={input} placeholder="Amendment 2, Mechanical drawings…" /></L>
        <L label="Type"><select name="type" defaultValue="Attachment" className={input}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></L>
        <L label="Upload (PDF or text)"><input name="file" type="file" accept=".pdf,.txt,.md,.csv,.html,.htm,application/pdf,text/*" className={input} /></L>
        <L label="…or a link (https://…)"><input name="url" type="url" maxLength={1000} className={input} placeholder="Where the file is kept" /></L>
        <L label="…or paste text" className="sm:col-span-2"><textarea name="paste" rows={3} maxLength={120000} className={input} /></L>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Add document</Button>
          <span className="text-xs text-slate-500">Text is read in your browser and kept with the bid. The AI analyses all the text you add here. Drawings and other files can be added as links.</span>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      </form>
      {docs.error && <p className="mb-3 text-sm text-red-700">{docs.error}</p>}
      {docs.rows === null ? <p className="text-slate-600">Loading…</p> : docs.rows.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No documents yet.</p> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {docs.rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{d.url ? <a href={d.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">{d.name}</a> : d.name}</p>
                <p className="text-xs text-slate-500">{d.doc_type}{d.extracted_text ? ` · ${d.extracted_text.length.toLocaleString()} characters of text` : ""}{d.url ? " · link" : ""} · added {ago(d.created_at)}</p>
              </div>
              <button type="button" onClick={() => void docs.remove(d.id)} aria-label={`Remove ${d.name}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- analysis and compliance
const LIST_FIELDS: [keyof BidAnalysis, string][] = [
  ["project_requirements", "Project requirements"], ["mandatory_qualifications", "Mandatory qualifications"], ["required_licenses", "Required licenses"], ["insurance", "Insurance"],
  ["certifications", "Certifications"], ["bonding", "Bonding"], ["required_attachments", "Required attachments"], ["evaluation_criteria", "Evaluation criteria"],
];

function Analysis({ ws, reqs, docs, reload }: { ws: BidWorkspace; reqs: ReturnType<typeof useChildRows<BidRequirement>>; docs: BidDocument[]; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rows = reqs.rows ?? [];
  const blockers = rows.filter((r) => r.mandatory && r.status !== "verified").length;
  const hasText = docs.some((d) => d.extracted_text);
  const a = ws.analysis;

  async function analyse() {
    setBusy(true);
    setMsg(null);
    const res = await callApi<{ analysis?: BidAnalysis; requirements?: { category: string; text: string; mandatory: boolean; status: string; evidence: string }[] }>("/api/bids/ai", { task: "analyze", workspaceId: ws.id });
    if (res.status !== 200 || !res.data.analysis) { setBusy(false); return setMsg({ ok: false, text: aiProblem(res.status, res.error) }); }
    const c = sb();
    // Keep what a person already decided about a requirement the AI finds again.
    const before = new Map(rows.map((r) => [r.text.trim().toLowerCase(), r]));
    const merged = (res.data.requirements ?? []).map((r) => {
      const old = before.get(r.text.trim().toLowerCase());
      return { workspace_id: ws.id, category: r.category, text: r.text, mandatory: r.mandatory, status: old && old.status !== "manual" ? old.status : r.status, evidence: old?.evidence || r.evidence || null, source: "ai" };
    });
    await c.from("bid_requirements").delete().eq("workspace_id", ws.id).eq("source", "ai");
    if (merged.length) await c.from("bid_requirements").insert(merged);
    const { error } = await c.from("bid_workspaces").update({ analysis: res.data.analysis, analyzed_at: new Date().toISOString() }).eq("id", ws.id);
    setBusy(false);
    setMsg(error ? { ok: false, text: "The analysis could not be saved." } : { ok: true, text: `Done. ${merged.length} requirements found. Check each one below.` });
    await reqs.reload();
    reload();
  }

  async function addManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await reqs.add({ category: String(f.get("category")), text: String(f.get("text") ?? "").trim(), mandatory: f.get("mandatory") === "on", status: "manual", source: "manual" });
    if (ok) form.reset();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-5">
        <Panel title="What the solicitation asks for">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void analyse()} disabled={busy || !hasText} className="!rounded-full !px-5 !py-2 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {a ? "Analyse again with AI" : "Analyse with AI"}</Button>
            {!hasText && <span className="text-sm text-slate-600">Add the solicitation text under Documents first.</span>}
            {ws.analyzed_at && <span className="text-xs text-slate-500">Last analysed {ago(ws.analyzed_at)}</span>}
          </div>
          <div role="status">{msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
          <div className="mt-2"><AiNote /></div>
          {a ? (
            <div className="mt-4 space-y-3 text-sm text-slate-800">
              {a.contract_title && <p><strong className="text-navy">Contract:</strong> {a.contract_title}{a.agency ? ` · ${a.agency}` : ""}</p>}
              {a.submission_deadline && <p><strong className="text-navy">Deadline as written:</strong> {a.submission_deadline}</p>}
              {a.scope_of_work && <p><strong className="text-navy">Scope of work:</strong> {a.scope_of_work}</p>}
              {LIST_FIELDS.map(([k, label]) => {
                const v = a[k];
                return Array.isArray(v) && v.length > 0 ? (
                  <div key={k}><p className="font-semibold text-navy">{label}</p><ul className="mt-0.5 list-disc space-y-0.5 pl-5">{v.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                ) : null;
              })}
            </div>
          ) : <p className="mt-3 text-sm text-slate-600">Nothing analysed yet.</p>}
        </Panel>
      </div>

      <div className="space-y-4">
        <div className={`rounded-2xl border p-4 ${blockers === 0 && rows.length > 0 ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
          <p className="flex items-center gap-2 text-sm font-bold text-navy"><ShieldCheck className="size-4" aria-hidden /> Compliance</p>
          <p className="mt-1 text-sm text-slate-800">{rows.length === 0 ? "No checklist yet. Analyse the solicitation or add requirements by hand." : blockers === 0 ? "Every mandatory requirement is verified." : `${blockers} mandatory ${blockers === 1 ? "requirement is" : "requirements are"} not verified yet. You cannot approve or submit until ${blockers === 1 ? "it is" : "they are"} verified, however well the bid seems to match.`}</p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            {REQ_STATUSES.map((s) => <span key={s} className={`rounded-full px-2 py-0.5 font-semibold ${REQ_STATUS_STYLE[s]}`}>{REQ_STATUS_LABEL[s]} {rows.filter((r) => r.status === s).length}</span>)}
          </p>
        </div>
        <form onSubmit={(e) => void addManual(e)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-navy">Add a requirement</p>
          <input name="text" required maxLength={600} placeholder="e.g. Proof of $1M liability insurance" aria-label="Requirement" className={input} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select name="category" defaultValue="other" aria-label="Category" className={`${input} !w-auto`}>{REQ_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" name="mandatory" defaultChecked className="size-4 rounded border-slate-300" /> Mandatory</label>
            <Button type="submit" variant="secondary" className="!rounded-full !px-4 !py-1.5 text-sm">Add</Button>
          </div>
        </form>
      </div>

      <div className="xl:col-span-2">
        {reqs.error && <p className="mb-3 text-sm text-red-700">{reqs.error}</p>}
        {reqs.rows === null ? <p className="text-slate-600">Loading…</p> : rows.length === 0 ? null : (
          <div className="space-y-5">
            {(["missing", "needs_update", "manual", "verified"] as ReqStatus[]).map((status) => {
              const group = rows.filter((r) => r.status === status);
              if (group.length === 0) return null;
              return (
                <section key={status} aria-label={REQ_GROUP_TITLE[status]}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy"><span className={`rounded-full px-2.5 py-0.5 text-xs ${REQ_STATUS_STYLE[status]}`}>{group.length}</span> {REQ_GROUP_TITLE[status]}</h3>
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {group.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-navy"><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 uppercase">{r.category}</span>{r.mandatory && <span className="mr-2 text-[11px] font-bold text-red-700 uppercase">Mandatory</span>}{r.text}</p>
                          <input defaultValue={r.evidence ?? ""} maxLength={600} aria-label={`Evidence for: ${r.text}`} placeholder="Evidence: policy number, certificate, where it is kept…"
                            onBlur={(e) => { if (e.target.value !== (r.evidence ?? "")) void reqs.change(r.id, { evidence: e.target.value.trim() || null }); }} className={`${input} mt-1.5 !text-sm`} />
                          {r.source === "ai" && <p className="mt-1 text-[11px] text-slate-500">Found by the AI. Check it against the document.</p>}
                        </div>
                        <select value={r.status} aria-label={`Status of: ${r.text}`} onChange={(e) => void reqs.change(r.id, { status: e.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                          {REQ_STATUSES.map((s) => <option key={s} value={s}>{REQ_STATUS_LABEL[s]}</option>)}
                        </select>
                        <button type="button" onClick={() => void reqs.remove(r.id)} aria-label={`Remove: ${r.text}`} className="mt-1 text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- proposal
const SECTION_CHOICES: [string, string][] = [["full", "Full proposal"], ["cover_letter", "Cover letter"], ["technical_response", "Technical response"], ["scope_of_work", "Scope of work"], ["labor_materials", "Labor and material breakdown"], ["company_profile", "Company profile"], ["references", "Past performance and references"]];

function Proposal({ ws, blockers, reload }: { ws: BidWorkspace; blockers: number; reload: () => void }) {
  const props = useChildRows<BidProposal>("bid_proposals", ws.id, { column: "version", ascending: false }, "workspace_id");
  const [pick, setPick] = useState<string | null>(null);
  const list = props.rows ?? [];
  const current = list.find((p) => p.id === pick) ?? list[0] ?? null;
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [loadedFor, setLoadedFor] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [kind, setKind] = useState("full");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const closed = ["submitted", "awarded", "lost", "expired"].includes(ws.status);

  // Show the chosen version in the editor.
  const key = current ? `${current.id}:${current.updated_at}` : "";
  useEffect(() => {
    if (key !== loadedFor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the editor follows the chosen version
      setSections(current?.sections ?? []);
      setLoadedFor(key);
    }
  }, [key, loadedFor, current]);

  const dirty = current ? JSON.stringify(sections) !== JSON.stringify(current.sections) : false;

  async function draft() {
    setBusy("draft");
    setMsg(null);
    const res = await callApi<{ sections?: ProposalSection[]; open_items?: string[] }>("/api/bids/ai", { task: "draft", workspaceId: ws.id, section: kind, note: note.trim() || undefined });
    if (res.status !== 200 || !res.data.sections) { setBusy(null); return setMsg({ ok: false, text: aiProblem(res.status, res.error) }); }
    // The draft becomes a NEW version in draft status; nothing is approved.
    const merged = kind === "full" || !current ? res.data.sections : [...sections.filter((s) => !res.data.sections?.some((n) => n.title.toLowerCase() === s.title.toLowerCase())), ...res.data.sections];
    const { data, error } = await sb().rpc("new_bid_proposal", { p_ws: ws.id, p_title: "Proposal", p_sections: merged, p_by_ai: true });
    setBusy(null);
    if (error || typeof data !== "string") return setMsg({ ok: false, text: "The draft could not be saved. Has supabase/schema-bidprep.sql been run?" });
    setOpenItems(res.data.open_items ?? []);
    setPick(data);
    setMsg({ ok: true, text: "A new draft was saved. Read it, edit it and check every claim before you approve." });
    await props.reload();
    reload();
  }
  async function blank() {
    setBusy("blank");
    const { data, error } = await sb().rpc("new_bid_proposal", { p_ws: ws.id, p_title: "Proposal", p_sections: [{ title: "Cover Letter", body: "" }], p_by_ai: false });
    setBusy(null);
    if (!error && typeof data === "string") { setPick(data); await props.reload(); reload(); }
  }
  async function save() {
    if (!current) return;
    setBusy("save");
    const { error } = await sb().from("bid_proposals").update({ sections: sections.filter((s) => s.title.trim() || s.body.trim()) }).eq("id", current.id);
    setBusy(null);
    setMsg(error ? { ok: false, text: "That did not save." } : { ok: true, text: "Saved." });
    await props.reload();
    reload();
  }
  async function review() {
    if (!current) return;
    setBusy("review");
    setMsg(null);
    if (dirty) await save();
    const res = await callApi<{ review?: string }>("/api/bids/ai", { task: "review", workspaceId: ws.id, proposalId: current.id });
    if (res.status !== 200 || !res.data.review) { setBusy(null); return setMsg({ ok: false, text: aiProblem(res.status, res.error) }); }
    await sb().from("bid_proposals").update({ review_notes: res.data.review }).eq("id", current.id);
    setBusy(null);
    await props.reload();
  }
  async function setStatus(s: "draft" | "internal_review" | "approved") {
    if (!current) return;
    setBusy(s);
    setMsg(null);
    if (dirty) await save();
    const { error } = await sb().rpc("set_bid_proposal_status", { p_proposal: current.id, p_status: s });
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: s === "approved" ? "Approved by you. You can now mark the bid Submitted once you have sent it to the agency." : "Status updated." });
    await props.reload();
    reload();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(sections.map((s) => `${s.title}\n\n${s.body}`).join("\n\n\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* the text is on screen */ }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {props.error && <p className="text-sm text-red-700">{props.error}</p>}
        {props.rows === null ? <p className="text-slate-600">Loading…</p> : !current ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-lg font-semibold text-navy">No proposal yet</p>
            <p className="mt-2 text-sm text-slate-600">Let the AI agent write a first draft from the solicitation, your profile and your cost worksheet, or start a blank one.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="font-medium text-slate-700">Version
                <select value={current.id} onChange={(e) => setPick(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1">{list.map((p) => <option key={p.id} value={p.id}>v{p.version}{p.by_ai ? " (AI draft)" : ""} · {p.status.replace("_", " ")}</option>)}</select>
              </label>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${current.status === "approved" ? "bg-green-100 text-green-900" : current.status === "internal_review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{current.status === "approved" ? `Approved ${current.approved_at ? ago(current.approved_at) : ""}` : current.status === "internal_review" ? "In internal review" : "Draft"}</span>
              <button type="button" onClick={() => void copy()} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy all text"}</button>
            </div>
            <div className="space-y-3">
              {sections.map((s, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <input value={s.title} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Section title" maxLength={120} disabled={closed} className={`${input} !font-semibold`} />
                    <button type="button" onClick={() => setSections(sections.filter((_, j) => j !== i))} disabled={closed} aria-label={`Remove section ${s.title}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
                  </div>
                  <textarea value={s.body} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} aria-label={`Text of ${s.title}`} rows={Math.min(18, Math.max(5, s.body.split("\n").length + 2))} maxLength={8000} disabled={closed} className={`${input} mt-2`} />
                </div>
              ))}
              {!closed && <button type="button" onClick={() => setSections([...sections, { title: "New section", body: "" }])} className="text-sm font-semibold text-primary hover:underline">+ Add a section</button>}
            </div>
            {sections.some((s) => /\[[^\]]+\]/.test(s.body)) && <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> There are [bracketed] placeholders to fill in or remove before you submit.</p>}
            {openItems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">To confirm before submitting</p><ul className="mt-1 list-disc pl-5">{openItems.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => void save()} disabled={!dirty || busy !== null || closed} variant="secondary" className="!rounded-full !px-5 !py-2 text-sm">{busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
              <Button onClick={() => void review()} disabled={busy !== null} variant="secondary" className="!rounded-full !px-5 !py-2 text-sm">{busy === "review" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Review with AI</Button>
              {!closed && current.status === "draft" && <Button onClick={() => void setStatus("internal_review")} disabled={busy !== null} className="!rounded-full !px-5 !py-2 text-sm">Send to internal review</Button>}
              {!closed && current.status !== "approved" && <Button onClick={() => void setStatus("approved")} disabled={busy !== null} className="!rounded-full !bg-green-700 !px-5 !py-2 text-sm hover:!bg-green-800"><Check className="size-4" aria-hidden /> I approve this proposal</Button>}
              {!closed && current.status !== "draft" && <button type="button" onClick={() => void setStatus("draft")} disabled={busy !== null} className="text-sm font-medium text-slate-600 underline">Back to draft</button>}
            </div>
            {blockers > 0 && current.status !== "approved" && <p className="text-xs text-slate-600">Approval is blocked while {blockers} mandatory {blockers === 1 ? "requirement is" : "requirements are"} unverified. See Analysis &amp; Compliance.</p>}
            {current.review_notes && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><p className="flex items-center gap-2 text-sm font-bold text-violet-900"><Sparkles className="size-4" aria-hidden /> AI review</p><p className="mt-2 text-sm whitespace-pre-line text-slate-800">{current.review_notes}</p></div>
            )}
          </>
        )}
        <div role="status">{msg && <p className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
      </div>

      <div className="space-y-4">
        <Panel title="Draft with the AI agent">
          <label className="block text-sm font-medium text-slate-700">What to write
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${input} mt-1`}>{SECTION_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="mt-2 block text-sm font-medium text-slate-700">Anything to stress <span className="font-normal text-slate-500">(optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={400} placeholder="Same-week mobilization, our experience with chillers…" className={`${input} mt-1`} />
          </label>
          <Button onClick={() => void draft()} disabled={busy !== null || closed} className="mt-3 !rounded-full !px-5 !py-2 text-sm">{busy === "draft" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Draft with AI</Button>
          {!current && <button type="button" onClick={() => void blank()} className="mt-3 ml-3 text-sm font-medium text-slate-600 underline">Start blank</button>}
          <div className="mt-3"><AiNote /></div>
          <p className="mt-2 text-xs text-slate-500">The draft uses the solicitation, your checklist, your cost worksheet and your profile. It claims only what you have verified and leaves [placeholders] for the rest. Each draft is saved as a new version.</p>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- estimate
function Estimate({ lines }: { lines: ReturnType<typeof useChildRows<BidEstimateLine>> }) {
  const rows = lines.rows ?? [];
  const total = rows.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
  const byKind = (k: string) => rows.filter((l) => l.kind === k).reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
  return (
    <div className="max-w-4xl">
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[8rem_minmax(0,1fr)_6rem_6rem_8rem_auto] sm:items-end" onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void lines.add({ kind: String(f.get("kind")), description: String(f.get("description") ?? "").trim(), quantity: Number(f.get("qty")), unit: String(f.get("unit") ?? "").trim() || null, unit_cost: Number(f.get("cost")) }).then((ok) => ok && form.reset());
      }}>
        <L label="Type"><select name="kind" className={input}><option value="labor">Labor</option><option value="material">Material</option><option value="equipment">Equipment</option><option value="other">Other</option></select></L>
        <L label="Description"><input name="description" required maxLength={300} className={input} placeholder="Install crew, 20-ton chiller…" /></L>
        <L label="Qty"><input name="qty" type="number" min="0" step="0.01" defaultValue="1" required className={input} /></L>
        <L label="Unit"><input name="unit" maxLength={30} className={input} placeholder="h, ea" /></L>
        <L label="Unit cost ($)"><input name="cost" type="number" min="0" step="0.01" required className={input} /></L>
        <Button type="submit" className="!rounded-full !px-5 !py-2 text-sm">Add</Button>
      </form>
      {lines.error && <p className="mb-3 text-sm text-red-700">{lines.error}</p>}
      {lines.rows === null ? <p className="text-slate-600">Loading…</p> : rows.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No lines yet. The AI uses this worksheet for the pricing part of the proposal, and states no price when it is empty.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit cost</th><th className="px-4 py-2 text-right">Total</th><th className="px-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => (
                <tr key={l.id}><td className="px-4 py-2 capitalize">{l.kind}</td><td className="px-4 py-2">{l.description}</td><td className="px-4 py-2 text-right tabular-nums">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td><td className="px-4 py-2 text-right tabular-nums">{usd(l.unit_cost)}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{usd(Number(l.quantity) * Number(l.unit_cost))}</td>
                  <td className="px-2"><button type="button" onClick={() => void lines.remove(l.id)} aria-label={`Remove ${l.description}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button></td></tr>
              ))}
            </tbody>
          </table>
          <p className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span>Labor {usd(byKind("labor"))}</span><span>Materials {usd(byKind("material"))}</span><span>Equipment {usd(byKind("equipment"))}</span><span>Other {usd(byKind("other"))}</span><strong className="text-navy">Total {usd(total)}</strong>
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- timeline
function Timeline({ wsId, refreshKey }: { wsId: string; refreshKey: string }) {
  const [rows, setRows] = useState<BidActivity[] | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(async () => {
    const { data } = await sb().from("bid_activities").select("*").eq("workspace_id", wsId).order("id", { ascending: false }).limit(300);
    setRows((data as BidActivity[] | null) ?? []);
  }, [wsId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load, refreshKey]);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    const { error } = await sb().from("bid_activities").insert({ workspace_id: wsId, type: "note", body: note.trim() });
    if (!error) { setNote(""); void load(); }
  }
  return (
    <div className="max-w-3xl">
      <form onSubmit={(e) => void add(e)} className="mb-4">
        <label htmlFor="bid-note" className="sr-only">Add a note</label>
        <textarea id="bid-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Add a note: a call with the contracting officer, a site visit…" className={inputClass} />
        <Button type="submit" disabled={!note.trim()} className="mt-2 !rounded-full !px-5 !py-2 text-sm">Add note</Button>
      </form>
      {rows === null ? <p className="text-slate-600">Loading…</p> : rows.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
        <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
          {rows.map((a) => (
            <li key={a.id}><span className="font-semibold text-navy">{ACTIVITY_LABEL[a.type] ?? a.type}</span><span className="ml-2 text-xs text-slate-500">{ago(a.created_at)}</span>{a.body && <p className="break-words whitespace-pre-line text-slate-700">{a.body}</p>}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One bid workspace: read the solicitation, check you qualify, write and approve the proposal, price it and track it to the award. */
export default function ContractorBidDetail() {
  const { id = "" } = useParams();
  const { listing } = useContractor();
  const [ws, setWs] = useState<BidWorkspace | null | undefined>(undefined);
  const [changed, setChanged] = useState(false);
  const [hasApproved, setHasApproved] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [tick, setTick] = useState(0);
  const docs = useChildRows<BidDocument>("bid_documents", id, ORDER_OLD, "workspace_id");
  const reqs = useChildRows<BidRequirement>("bid_requirements", id, ORDER_OLD, "workspace_id");
  const lines = useChildRows<BidEstimateLine>("bid_estimate_lines", id, ORDER_OLD, "workspace_id");

  const load = useCallback(async () => {
    const c = sb();
    const [w, p, ch] = await Promise.all([
      c.from("bid_workspaces").select("*").eq("id", id).maybeSingle(),
      c.from("bid_proposals").select("id").eq("workspace_id", id).eq("status", "approved").limit(1),
      c.rpc("my_bid_source_changes"),
    ]);
    setWs((w.data as BidWorkspace | null) ?? null);
    setHasApproved(((p.data as unknown[] | null) ?? []).length > 0);
    setChanged(((ch.data as { workspace_id: string }[] | null) ?? []).some((x) => x.workspace_id === id));
    setTick((t) => t + 1);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    if (listing) void load();
  }, [listing, load]);

  const blockers = useMemo(() => (reqs.rows ?? []).filter((r) => r.mandatory && r.status !== "verified").length, [reqs.rows]);
  const reloadAll = useCallback(() => { void load(); void reqs.reload(); void docs.reload(); }, [load, reqs, docs]);

  if (!listing) return <PageTitle title="Bid" />;
  if (ws === undefined) return <p className="text-slate-600">Loading…</p>;
  if (ws === null) {
    return (
      <>
        <PageTitle title="Bid not found" />
        <Panel title="This bid is not available"><p className="text-sm text-slate-700">It may have been removed. <Link to="/contractor/bid-preparation" className="font-semibold text-primary underline">Back to Bid Preparation</Link></p></Panel>
      </>
    );
  }
  const d = daysUntil(ws.due_at);

  return (
    <>
      <Link to="/contractor/bid-preparation" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden /> Bid Preparation</Link>
      <PageTitle title={ws.title} description={<span className="inline-flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${BID_STATUS_STYLE[ws.status]}`}>{BID_STATUS_LABEL[ws.status]}</span><span>{ws.agency}</span><span className={d !== null && d >= 0 && d <= 3 ? "font-bold text-emergency" : ""}>{dueLabel(d)}</span></span>} />

      <div role="tablist" aria-label="Bid sections" className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t}{t === "Analysis & Compliance" && blockers > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{blockers}</span>}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview ws={ws} blockers={blockers} hasApproved={hasApproved} changed={changed} reload={() => void load()} />}
      {tab === "Documents" && <Documents ws={ws} docs={docs} />}
      {tab === "Analysis & Compliance" && <Analysis ws={ws} reqs={reqs} docs={docs.rows ?? []} reload={() => void load()} />}
      {tab === "Proposal" && <Proposal ws={ws} blockers={blockers} reload={reloadAll} />}
      {tab === "Cost Estimate" && <Estimate lines={lines} />}
      {tab === "Timeline" && <Timeline wsId={ws.id} refreshKey={`${tick}:${docs.rows?.length}:${reqs.rows?.length}:${lines.rows?.length}`} />}
    </>
  );
}
