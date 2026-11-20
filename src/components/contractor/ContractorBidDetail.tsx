import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Building2, CalendarClock, Check, CheckCircle2, Circle, Copy, ExternalLink, FileWarning, Hash, Loader2, Mail, MapPin, Phone, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import {
  BID_STATUSES, BID_STATUS_LABEL, BID_STATUS_STYLE, DOC_TYPES, REQ_CATEGORIES, REQ_GROUP_TITLE, REQ_STATUSES, REQ_STATUS_LABEL, REQ_STATUS_STYLE, daysUntil, dueLabel,
  type BidActivity, type BidAnalysis, type BidDocument, type BidEstimateLine, type BidProposal, type BidRequirement, type BidStatus, type BidWorkspace, type ProposalSection, type ReqStatus,
} from "@/lib/bidprep";
import type { GovBid } from "@/lib/bids";
import { extractText } from "@/lib/extract-text";
import { usd } from "@/lib/projects";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";
import { useContractor } from "./context";
import { EmailOpportunity } from "./EmailOpportunity";
import { ago } from "./useMyLeads";
import { useChildRows } from "./useProjects";

const TABS = ["Overview", "Documents", "Analysis & Compliance", "Proposal", "Cost Estimate", "Timeline"] as const;
type Tab = (typeof TABS)[number];
const ORDER_OLD = { column: "created_at", ascending: true };
const input = `${inputClass} !py-1.5 !text-sm`;
const L = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => (
  <label className={`block text-xs font-semibold text-slate-600 ${className}`}>{label}<span className="mt-1 block font-normal">{children}</span></label>
);
const ACTIVITY_LABEL: Record<string, string> = { created: "Created", status: "Status", note: "Note", document: "Document", analysis: "Analysis", requirement: "Checklist", proposal: "Proposal", estimate: "Estimate", amendment: "Amendment", converted: "Converted" };
const sb = () => getSupabaseBrowser();
/** The path a bid normally takes. Lost and Expired sit apart. */
const FLOW: BidStatus[] = BID_STATUSES.filter((s) => s !== "lost" && s !== "expired");

function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-navy">{title}</h2>{aside && <div className="text-xs text-slate-500">{aside}</div>}</div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-center text-sm text-slate-500">{children}</p>;
const RemoveBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-label={label} className="shrink-0 text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
);
function Stat({ label, value, hint, tone = "" }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return <div className={`rounded-xl border bg-white px-3.5 py-2.5 ${tone || "border-slate-200"}`}><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="truncate text-base font-bold text-navy">{value}</p>{hint && <p className="truncate text-[11px] text-slate-500">{hint}</p>}</div>;
}
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</dt><dd className="mt-0.5 text-sm break-words text-slate-900">{children}</dd></div>;
}
const dayText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : null);
const dayTime = (iso: string | null) => (iso ? `${dayText(iso)}, ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : null);

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

// ---------------------------------------------------------------- the status path
/** The bid's status as a path. A click tries the move; the database refuses an Approved or Submitted bid without an approved proposal. */
function StatusFlow({ ws, reload }: { ws: BidWorkspace; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const at = FLOW.indexOf(ws.status);
  const locked = ws.status === "awarded";
  async function move(status: BidStatus) {
    setBusy(true);
    setError(null);
    const { error: err } = await sb().from("bid_workspaces").update({ status }).eq("id", ws.id);
    setBusy(false);
    if (err) return setError(err.message);
    reload();
  }
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bid status">
        {FLOW.map((s, i) => (
          <button key={s} type="button" disabled={busy || locked || ws.status === s} onClick={() => void move(s)} aria-pressed={ws.status === s}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${ws.status === s ? "bg-primary text-white" : at > i ? "bg-blue-50 text-primary hover:bg-blue-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"} disabled:cursor-default`}>
            {at > i && <Check className="size-3" aria-hidden />}{BID_STATUS_LABEL[s]}
          </button>
        ))}
        {!locked && (["lost", "expired"] as BidStatus[]).map((s, i) => (
          <button key={s} type="button" disabled={busy || ws.status === s} onClick={() => void move(s)} aria-pressed={ws.status === s}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${i === 0 ? "ml-auto" : ""} ${ws.status === s ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{BID_STATUS_LABEL[s]}</button>
        ))}
      </div>
      <div role="alert">{error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}</div>
      <p className="mt-2 text-xs text-slate-500">&quot;Submitted&quot; means you sent the bid on the agency&apos;s own site. Mark it only after you have.</p>
    </div>
  );
}

// ---------------------------------------------------------------- overview
function Overview({ ws, notice, steps, blockers, changed, reload, go }: {
  ws: BidWorkspace; notice: GovBid | null; steps: { label: string; done: boolean; tab: Tab }[]; blockers: number; changed: boolean; reload: () => void; go: (t: Tab) => void;
}) {
  const navigate = useNavigate();
  const { listing } = useContractor();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [value, setValue] = useState(ws.contract_value ? String(ws.contract_value) : "");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [edit, setEdit] = useState(!ws.gov_bid_id);
  const [now] = useState(() => Date.now());
  const d = daysUntil(notice?.response_due ?? ws.due_at, now);

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

  const n = notice;
  const agency = n ? [n.department, n.agency, n.office].filter((v, i, a) => v && a.indexOf(v) === i).join(" › ") : ws.agency;
  const where = n ? [n.address, [n.city, n.state].filter(Boolean).join(", "), n.zip].filter(Boolean).join(" · ") : ws.location;
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-4">
        {changed && (
          <div role="alert" className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
            <p className="flex items-center gap-2 font-bold"><FileWarning className="size-4" aria-hidden /> The notice was changed after you started</p>
            <p className="mt-1">The agency may have amended the solicitation or moved the deadline. Update this workspace, then analyse it again and re-check the requirements.</p>
            <Button onClick={() => void takeNotice()} disabled={busy} className="mt-2 !rounded-full !px-4 !py-1.5 text-sm">Update from the notice</Button>
          </div>
        )}

        <Card title="About this bid" aside={n ? `${n.notice_type} · notice ${n.notice_id}` : ws.source ?? undefined}>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Agency"><span className="inline-flex items-start gap-1.5"><Building2 className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />{agency || "Not listed"}</span></Fact>
            <Fact label="Solicitation number"><span className="inline-flex items-center gap-1.5"><Hash className="size-3.5 text-slate-400" aria-hidden />{(n?.solicitation_number ?? ws.solicitation_number) || "Not listed"}</span></Fact>
            <Fact label="Notice type">{n?.notice_type ?? "Added by you"}</Fact>
            <Fact label="Response due"><span className={d !== null && d >= 0 && d <= 3 ? "font-bold text-emergency" : ""}>{dayTime(n?.response_due ?? ws.due_at) ?? "No deadline listed"}</span>{d !== null && <span className="block text-xs text-slate-500">{dueLabel(d)}</span>}</Fact>
            <Fact label="Posted">{dayText(n?.posted_at ?? null) ?? "Not listed"}</Fact>
            <Fact label="Set-aside">{n ? (n.set_aside ?? "None: open to every size of business") : "Not listed"}</Fact>
            <Fact label="Place of performance"><span className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />{where || "Not listed"}</span></Fact>
            <Fact label="NAICS code">{n?.naics ?? "Not listed"}</Fact>
            <Fact label="Product or service code">{n?.psc ?? "Not listed"}</Fact>
            <Fact label="Contract value">{ws.contract_value !== null ? usd(ws.contract_value) : "Not set"}</Fact>
            {n?.relevance && <div className="sm:col-span-2 lg:col-span-2"><Fact label="Counted as HVAC work because">{n.relevance}</Fact></div>}
          </dl>
          {(n?.summary || n?.description || ws.notes) && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              {n?.summary && <p className="text-sm font-semibold text-navy">{n.summary}</p>}
              {n?.description && (
                <>
                  <p className={`mt-1.5 text-sm whitespace-pre-line text-slate-700 ${more ? "" : "line-clamp-6"}`}>{n.description}</p>
                  {n.description.length > 420 && <button type="button" onClick={() => setMore(!more)} className="mt-1 text-sm font-semibold text-primary hover:underline">{more ? "Show less" : "Read the full description"}</button>}
                </>
              )}
              {ws.notes && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Your notes:</strong> {ws.notes}</p>}
            </div>
          )}
          {(n?.sam_url || n?.info_url) && (
            <p className="mt-3 flex flex-wrap gap-2">
              {n.sam_url && <a href={n.sam_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">Open on SAM.gov <ExternalLink className="size-3.5" aria-hidden /></a>}
              {n.info_url && <a href={n.info_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">More information <ExternalLink className="size-3.5" aria-hidden /></a>}
            </p>
          )}
        </Card>

        {n && (
          <Card title="Contracting contacts" aside={`${n.contacts?.length ?? 0}`}>
            {(n.contacts ?? []).length === 0 ? <Empty>No contact is listed for this bid.</Empty> : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {n.contacts.map((c, i) => (
                  <li key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="font-semibold text-navy">{c.name ?? "Contact"}</p>
                    {c.title && <p className="text-xs text-slate-500">{c.title}</p>}
                    <p className="mt-2 flex items-start gap-2 text-slate-700"><Mail className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><span className="break-all">{c.email ?? "No email"}</span></p>
                    <p className="mt-1 flex items-start gap-2 text-slate-700"><Phone className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />{c.phone ? <a href={`tel:${c.phone.replace(/\D/g, "")}`} className="text-primary hover:underline">{c.phone}</a> : "No phone"}</p>
                    {c.email && listing && (
                      <div className="mt-2">
                        <EmailOpportunity kind="bid" itemId={n.id} index={i} email={c.email} recipient={c.name ?? c.email} businessName={listing.business_name} label="Email the contracting officer"
                          defaultSubject={`Interest in ${n.solicitation_number ?? n.title}`} project={n.title} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Your details" aside={<button type="button" onClick={() => setEdit(!edit)} className="font-semibold text-primary hover:underline">{edit ? "Hide" : "Edit"}</button>}>
          {edit ? (
            <form key={ws.updated_at} onSubmit={(e) => void saveDetails(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <L label="Bid title" className="sm:col-span-2 lg:col-span-4"><input name="title" defaultValue={ws.title} maxLength={300} required className={input} /></L>
              <L label="Issuing agency"><input name="agency" defaultValue={ws.agency ?? ""} maxLength={200} className={input} /></L>
              <L label="Solicitation number"><input name="number" defaultValue={ws.solicitation_number ?? ""} maxLength={120} className={input} /></L>
              <L label="Place of performance"><input name="location" defaultValue={ws.location ?? ""} maxLength={300} className={input} /></L>
              <L label="Contract value ($)"><input name="value" type="number" min="0" step="0.01" defaultValue={ws.contract_value ?? ""} className={input} /></L>
              <L label="Submission deadline"><input name="due" type="date" defaultValue={ws.due_at ? ws.due_at.slice(0, 10) : ""} className={input} /></L>
              <L label="Notes" className="sm:col-span-2 lg:col-span-3"><input name="notes" defaultValue={ws.notes ?? ""} maxLength={4000} className={input} placeholder="Site visit Tuesday, call the officer about bonding…" /></L>
              <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-1.5 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save details</Button>
                <span role="status" className={`text-sm ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</span>
              </div>
            </form>
          ) : <p className="text-sm text-slate-600">Change the title, deadline, value or notes for your own tracking. The notice details above stay as published.</p>}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Ready to submit?" aside={`${done} of ${steps.length}`}>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Steps done"><div className="h-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          <ul className="space-y-0.5">
            {steps.map((s) => (
              <li key={s.label}>
                <button type="button" onClick={() => go(s.tab)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-slate-50">
                  {s.done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="size-4 shrink-0 text-slate-300" aria-hidden />}
                  <span className={s.done ? "text-slate-500 line-through" : "font-medium text-navy"}>{s.label}</span>
                  <span className="ml-auto truncate text-[11px] text-slate-400">{s.tab}</span>
                </button>
              </li>
            ))}
          </ul>
          {blockers > 0 && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {blockers} mandatory {blockers === 1 ? "requirement is" : "requirements are"} not verified. A good AI match does not change that.</p>}
        </Card>

        {ws.status === "awarded" && (
          <Card title="Awarded: make it a project" className="border-emerald-200 bg-emerald-50/40">
            {projectId ? <Link to={`/contractor/projects/${projectId}`} className="font-semibold text-primary hover:underline">View the project</Link> : (
              <>
                <p className="text-sm text-slate-700">The agency, place, scope and documents move across for you.</p>
                <label className="mt-2 block text-xs font-semibold text-slate-600">Awarded contract value ($)<input type="number" min="1" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={`${input} mt-1`} /></label>
                <Button onClick={() => void convert()} disabled={busy || !(Number(value) > 0)} className="mt-2 !rounded-full !px-5 !py-1.5 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Convert to Project</Button>
                <div role="status">{msg && !msg.ok && <p className="mt-2 text-sm text-red-700">{msg.text}</p>}</div>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- documents
function Documents({ docs }: { docs: ReturnType<typeof useChildRows<BidDocument>> }) {
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
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <Card title="Add a document">
        <form onSubmit={(e) => void addFile(e)} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <L label="Name"><input name="name" maxLength={200} className={input} placeholder="Amendment 2…" /></L>
            <L label="Type"><select name="type" defaultValue="Attachment" className={input}>{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select></L>
          </div>
          <L label="Upload (PDF or text)"><input name="file" type="file" accept=".pdf,.txt,.md,.csv,.html,.htm,application/pdf,text/*" className={input} /></L>
          <L label="…or a link (https://…)"><input name="url" type="url" maxLength={1000} className={input} placeholder="Where the file is kept" /></L>
          <L label="…or paste text"><textarea name="paste" rows={3} maxLength={120000} className={`${input} [field-sizing:content] max-h-60`} /></L>
          <Button type="submit" disabled={busy} className="!rounded-full !py-1.5 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Add document</Button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <p className="text-xs text-slate-500">Text is read in your browser and kept with the bid. The AI analyses all the text you add. Drawings and other files can be added as links.</p>
        </form>
      </Card>
      <Card title="Documents" aside={docs.rows ? `${docs.rows.length}` : undefined}>
        {docs.error && <p className="mb-2 text-sm text-red-700">{docs.error}</p>}
        {docs.rows === null ? <p className="text-sm text-slate-500">Loading…</p> : docs.rows.length === 0 ? <Empty>No documents yet. Add the solicitation first.</Empty> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {docs.rows.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{d.url ? <a href={d.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">{d.name}</a> : d.name}</p>
                  <p className="text-xs text-slate-500">{d.doc_type}{d.extracted_text ? ` · ${d.extracted_text.length.toLocaleString()} characters` : ""}{d.url ? " · link" : ""} · {ago(d.created_at)}</p>
                </div>
                <RemoveBtn label={`Remove ${d.name}`} onClick={() => void docs.remove(d.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <Card title="What the solicitation asks for" aside={ws.analyzed_at ? `Analysed ${ago(ws.analyzed_at)}` : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void analyse()} disabled={busy || !hasText} className="!rounded-full !px-5 !py-1.5 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {a ? "Analyse again with AI" : "Analyse with AI"}</Button>
            {!hasText && <span className="text-sm text-slate-600">Add the solicitation text under Documents first.</span>}
          </div>
          <div role="status">{msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
          <div className="mt-2"><AiNote /></div>
          {a ? (
            <div className="mt-4 space-y-3 text-sm text-slate-800">
              {(a.contract_title || a.submission_deadline) && (
                <p className="flex flex-wrap gap-x-6 gap-y-1">
                  {a.contract_title && <span><strong className="text-navy">Contract:</strong> {a.contract_title}{a.agency ? ` · ${a.agency}` : ""}</span>}
                  {a.submission_deadline && <span><strong className="text-navy">Deadline as written:</strong> {a.submission_deadline}</span>}
                </p>
              )}
              {a.scope_of_work && <p className="rounded-lg bg-slate-50 p-3"><strong className="text-navy">Scope of work:</strong> {a.scope_of_work}</p>}
              <div className="grid gap-3 md:grid-cols-2">
                {LIST_FIELDS.map(([k, label]) => {
                  const v = a[k];
                  return Array.isArray(v) && v.length > 0 ? (
                    <div key={k} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-navy">{label}</p><ul className="mt-1 list-disc space-y-0.5 pl-5">{v.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  ) : null;
                })}
              </div>
            </div>
          ) : <div className="mt-3"><Empty>Nothing analysed yet.</Empty></div>}
        </Card>
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
          <p className="mb-2 text-sm font-bold text-navy">Add a requirement</p>
          <input name="text" required maxLength={600} placeholder="e.g. Proof of $1M liability insurance" aria-label="Requirement" className={input} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select name="category" defaultValue="other" aria-label="Category" className={`${input} !w-auto`}>{REQ_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" name="mandatory" defaultChecked className="size-4 rounded border-slate-300" /> Mandatory</label>
            <Button type="submit" variant="secondary" className="!rounded-full !px-4 !py-1 text-sm">Add</Button>
          </div>
        </form>
      </div>

      <div className="xl:col-span-2">
        {reqs.error && <p className="mb-3 text-sm text-red-700">{reqs.error}</p>}
        {reqs.rows === null ? <p className="text-slate-600">Loading…</p> : rows.length === 0 ? null : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {(["missing", "needs_update", "manual", "verified"] as ReqStatus[]).map((status) => {
              const group = rows.filter((r) => r.status === status);
              if (group.length === 0) return null;
              return (
                <section key={status} aria-label={REQ_GROUP_TITLE[status]} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy"><span className={`rounded-full px-2.5 py-0.5 text-xs ${REQ_STATUS_STYLE[status]}`}>{group.length}</span> {REQ_GROUP_TITLE[status]}</h3>
                  <ul className="divide-y divide-slate-100">
                    {group.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-start gap-2 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-navy"><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 uppercase">{r.category}</span>{r.mandatory && <span className="mr-2 text-[11px] font-bold text-red-700 uppercase">Mandatory</span>}{r.text}</p>
                          <input defaultValue={r.evidence ?? ""} maxLength={600} aria-label={`Evidence for: ${r.text}`} placeholder="Evidence: policy number, certificate, where it is kept…"
                            onBlur={(e) => { if (e.target.value !== (r.evidence ?? "")) void reqs.change(r.id, { evidence: e.target.value.trim() || null }); }} className={`${input} mt-1.5`} />
                          {r.source === "ai" && <p className="mt-1 text-[11px] text-slate-500">Found by the AI. Check it against the document.</p>}
                        </div>
                        <select value={r.status} aria-label={`Status of: ${r.text}`} onChange={(e) => void reqs.change(r.id, { status: e.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                          {REQ_STATUSES.map((s) => <option key={s} value={s}>{REQ_STATUS_LABEL[s]}</option>)}
                        </select>
                        <RemoveBtn label={`Remove: ${r.text}`} onClick={() => void reqs.remove(r.id)} />
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-3">
        {props.error && <p className="text-sm text-red-700">{props.error}</p>}
        {props.rows === null ? <p className="text-slate-600">Loading…</p> : !current ? (
          <Empty>No proposal yet. Let the AI agent write a first draft, or start a blank one.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
              <label className="font-medium text-slate-700">Version
                <select value={current.id} onChange={(e) => setPick(e.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1">{list.map((p) => <option key={p.id} value={p.id}>v{p.version}{p.by_ai ? " (AI draft)" : ""} · {p.status.replace("_", " ")}</option>)}</select>
              </label>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${current.status === "approved" ? "bg-green-100 text-green-900" : current.status === "internal_review" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{current.status === "approved" ? `Approved ${current.approved_at ? ago(current.approved_at) : ""}` : current.status === "internal_review" ? "In internal review" : "Draft"}</span>
              <button type="button" onClick={() => void copy()} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy all text"}</button>
            </div>
            {sections.map((s, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <input value={s.title} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Section title" maxLength={120} disabled={closed} className={`${input} !font-semibold`} />
                  <RemoveBtn label={`Remove section ${s.title}`} onClick={() => !closed && setSections(sections.filter((_, j) => j !== i))} />
                </div>
                <textarea value={s.body} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} aria-label={`Text of ${s.title}`} rows={Math.min(18, Math.max(4, s.body.split("\n").length + 1))} maxLength={8000} disabled={closed} className={`${input} mt-2`} />
              </div>
            ))}
            {!closed && <button type="button" onClick={() => setSections([...sections, { title: "New section", body: "" }])} className="text-sm font-semibold text-primary hover:underline">+ Add a section</button>}
            {sections.some((s) => /\[[^\]]+\]/.test(s.body)) && <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> There are [bracketed] placeholders to fill in or remove before you submit.</p>}
            {openItems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">To confirm before submitting</p><ul className="mt-1 list-disc pl-5">{openItems.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
            )}
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur">
              <Button onClick={() => void save()} disabled={!dirty || busy !== null || closed} variant="secondary" className="!rounded-full !px-4 !py-1.5 text-sm">{busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
              <Button onClick={() => void review()} disabled={busy !== null} variant="secondary" className="!rounded-full !px-4 !py-1.5 text-sm">{busy === "review" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Review with AI</Button>
              {!closed && current.status === "draft" && <Button onClick={() => void setStatus("internal_review")} disabled={busy !== null} className="!rounded-full !px-4 !py-1.5 text-sm">Send to internal review</Button>}
              {!closed && current.status !== "approved" && <Button onClick={() => void setStatus("approved")} disabled={busy !== null} className="!rounded-full !bg-green-700 !px-4 !py-1.5 text-sm hover:!bg-green-800"><Check className="size-4" aria-hidden /> I approve this proposal</Button>}
              {!closed && current.status !== "draft" && <button type="button" onClick={() => void setStatus("draft")} disabled={busy !== null} className="text-sm font-medium text-slate-600 underline">Back to draft</button>}
              {blockers > 0 && current.status !== "approved" && <p className="basis-full text-xs text-slate-600">Approval is blocked while {blockers} mandatory {blockers === 1 ? "requirement is" : "requirements are"} unverified. See Analysis &amp; Compliance.</p>}
            </div>
            {current.review_notes && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><p className="flex items-center gap-2 text-sm font-bold text-violet-900"><Sparkles className="size-4" aria-hidden /> AI review</p><p className="mt-2 text-sm whitespace-pre-line text-slate-800">{current.review_notes}</p></div>
            )}
          </>
        )}
        <div role="status">{msg && <p className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
      </div>

      <Card title="Draft with the AI agent" className="xl:sticky xl:top-4">
        <label className="block text-xs font-semibold text-slate-600">What to write
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${input} mt-1`}>{SECTION_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="mt-2 block text-xs font-semibold text-slate-600">Anything to stress <span className="font-normal text-slate-500">(optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={400} placeholder="Same-week mobilization, our experience with chillers…" className={`${input} mt-1`} />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => void draft()} disabled={busy !== null || closed} className="!rounded-full !px-5 !py-1.5 text-sm">{busy === "draft" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Draft with AI</Button>
          {!current && <button type="button" onClick={() => void blank()} className="text-sm font-medium text-slate-600 underline">Start blank</button>}
        </div>
        <div className="mt-3"><AiNote /></div>
        <p className="mt-2 text-xs text-slate-500">It uses the solicitation, your checklist, your cost worksheet and your profile, claims only what you have verified, and leaves [placeholders] for the rest. Each draft is a new version.</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- estimate
function Estimate({ lines }: { lines: ReturnType<typeof useChildRows<BidEstimateLine>> }) {
  const rows = lines.rows ?? [];
  const total = rows.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
  const byKind = (k: string) => rows.filter((l) => l.kind === k).reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-3">
        <form className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[7.5rem_minmax(0,1fr)_5rem_5rem_7rem_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          void lines.add({ kind: String(f.get("kind")), description: String(f.get("description") ?? "").trim(), quantity: Number(f.get("qty")), unit: String(f.get("unit") ?? "").trim() || null, unit_cost: Number(f.get("cost")) }).then((ok) => ok && form.reset());
        }}>
          <L label="Type"><select name="kind" className={input}><option value="labor">Labor</option><option value="material">Material</option><option value="equipment">Equipment</option><option value="other">Other</option></select></L>
          <L label="Description" className="col-span-2 sm:col-span-1"><input name="description" required maxLength={300} className={input} placeholder="Install crew, 20-ton chiller…" /></L>
          <L label="Qty"><input name="qty" type="number" min="0" step="0.01" defaultValue="1" required className={input} /></L>
          <L label="Unit"><input name="unit" maxLength={30} className={input} placeholder="h, ea" /></L>
          <L label="Unit cost ($)"><input name="cost" type="number" min="0" step="0.01" required className={input} /></L>
          <Button type="submit" className="!rounded-full !px-5 !py-1.5 text-sm">Add</Button>
        </form>
        {lines.error && <p className="text-sm text-red-700">{lines.error}</p>}
        {lines.rows === null ? <p className="text-slate-600">Loading…</p> : rows.length === 0 ? <Empty>No lines yet. The AI uses this worksheet for the pricing part of the proposal, and states no price while it is empty.</Empty> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2">Type</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit cost</th><th className="px-4 py-2 text-right">Total</th><th className="px-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l) => (
                  <tr key={l.id}><td className="px-4 py-2 capitalize">{l.kind}</td><td className="px-4 py-2">{l.description}</td><td className="px-4 py-2 text-right tabular-nums">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td><td className="px-4 py-2 text-right tabular-nums">{usd(l.unit_cost)}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{usd(Number(l.quantity) * Number(l.unit_cost))}</td>
                    <td className="px-2"><RemoveBtn label={`Remove ${l.description}`} onClick={() => void lines.remove(l.id)} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Card title="Cost summary" className="lg:sticky lg:top-4">
        <dl className="space-y-1.5 text-sm">
          {([["Labor", "labor"], ["Materials", "material"], ["Equipment", "equipment"], ["Other", "other"]] as const).map(([label, k]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-navy tabular-nums">{usd(byKind(k))}</dd></div>)}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-bold text-navy">Total</dt><dd className="font-extrabold text-navy tabular-nums">{usd(total)}</dd></div>
        </dl>
      </Card>
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card title="Add a note">
        <form onSubmit={(e) => void add(e)}>
          <label htmlFor="bid-note" className="sr-only">Add a note</label>
          <textarea id="bid-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder="A call with the contracting officer, a site visit…" className={inputClass} />
          <Button type="submit" disabled={!note.trim()} className="mt-2 !rounded-full !px-5 !py-1.5 text-sm">Add note</Button>
        </form>
      </Card>
      <Card title="Everything that happened" aside={rows ? `${rows.length}` : undefined}>
        {rows === null ? <p className="text-sm text-slate-500">Loading…</p> : rows.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
            {rows.map((a) => (
              <li key={a.id}><span className="font-semibold text-navy">{ACTIVITY_LABEL[a.type] ?? a.type}</span><span className="ml-2 text-xs text-slate-500">{ago(a.created_at)}</span>{a.body && <p className="break-words whitespace-pre-line text-slate-700">{a.body}</p>}</li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

/** One bid workspace. The page reads as a path: the notice in full, where the bid stands, what is left before you can submit, then the work. */
export default function ContractorBidDetail() {
  const { id = "" } = useParams();
  const { listing } = useContractor();
  const [ws, setWs] = useState<BidWorkspace | null | undefined>(undefined);
  const [notice, setNotice] = useState<GovBid | null>(null);
  const [changed, setChanged] = useState(false);
  const [proposals, setProposals] = useState<{ id: string; status: string }[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [tick, setTick] = useState(0);
  const [now] = useState(() => Date.now());
  const docs = useChildRows<BidDocument>("bid_documents", id, ORDER_OLD, "workspace_id");
  const reqs = useChildRows<BidRequirement>("bid_requirements", id, ORDER_OLD, "workspace_id");
  const lines = useChildRows<BidEstimateLine>("bid_estimate_lines", id, ORDER_OLD, "workspace_id");

  const load = useCallback(async () => {
    const c = sb();
    const [w, p, ch] = await Promise.all([
      c.from("bid_workspaces").select("*").eq("id", id).maybeSingle(),
      c.from("bid_proposals").select("id, status").eq("workspace_id", id),
      c.rpc("my_bid_source_changes"),
    ]);
    setWs((w.data as BidWorkspace | null) ?? null);
    setProposals((p.data as { id: string; status: string }[] | null) ?? []);
    setChanged(((ch.data as { workspace_id: string }[] | null) ?? []).some((x) => x.workspace_id === id));
    setTick((t) => t + 1);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    if (listing) void load();
  }, [listing, load]);
  // The whole notice (contacts, codes, set-aside, description) for a bid that came from the government notices.
  const noticeId = ws?.gov_bid_id ?? null;
  useEffect(() => {
    if (!noticeId) return;
    void sb().rpc("my_bids").then(({ data }) => setNotice(((data as GovBid[] | null) ?? []).find((b) => b.id === noticeId) ?? null));
  }, [noticeId, ws?.updated_at]);

  const blockers = useMemo(() => (reqs.rows ?? []).filter((r) => r.mandatory && r.status !== "verified").length, [reqs.rows]);
  const reloadAll = useCallback(() => { void load(); void reqs.reload(); void docs.reload(); }, [load, reqs, docs]);

  if (!listing || ws === undefined) return <p className="text-slate-600">Loading…</p>;
  if (ws === null) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-bold text-navy">This bid is not available</h1>
        <p className="mt-1 text-sm text-slate-700">It may have been removed. <Link to="/contractor/bid-preparation" className="font-semibold text-primary underline">Back to Bid Preparation</Link></p>
      </section>
    );
  }
  const due = notice?.response_due ?? ws.due_at;
  const d = daysUntil(due, now);
  const reqRows = reqs.rows ?? [];
  const verified = reqRows.filter((r) => r.status === "verified").length;
  const total = (lines.rows ?? []).reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0);
  const approved = proposals.some((p) => p.status === "approved");
  const steps: { label: string; done: boolean; tab: Tab }[] = [
    { label: "Add the solicitation text", done: (docs.rows ?? []).some((x) => x.extracted_text), tab: "Documents" },
    { label: "Analyse it and build the checklist", done: Boolean(ws.analyzed_at), tab: "Analysis & Compliance" },
    { label: "Verify every mandatory requirement", done: reqRows.length > 0 && blockers === 0, tab: "Analysis & Compliance" },
    { label: "Price the work", done: (lines.rows ?? []).length > 0, tab: "Cost Estimate" },
    { label: "Draft the proposal", done: proposals.length > 0, tab: "Proposal" },
    { label: "Approve the proposal yourself", done: approved, tab: "Proposal" },
  ];

  return (
    <>
      <Link to="/contractor/bid-preparation" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden /> Bid Preparation</Link>
      <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h1 title={ws.title} className="line-clamp-2 text-xl font-bold text-navy sm:text-2xl">{ws.title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${BID_STATUS_STYLE[ws.status]}`}>{BID_STATUS_LABEL[ws.status]}</span>
          {(notice?.agency ?? ws.agency) && <span className="inline-flex items-center gap-1"><Building2 className="size-3.5 text-slate-400" aria-hidden /> {notice?.agency ?? ws.agency}</span>}
          {(notice?.solicitation_number ?? ws.solicitation_number) && <span className="inline-flex items-center gap-1"><Hash className="size-3.5 text-slate-400" aria-hidden /> {notice?.solicitation_number ?? ws.solicitation_number}</span>}
          <span className={`inline-flex items-center gap-1 ${d !== null && d >= 0 && d <= 3 ? "font-bold text-emergency" : ""}`}><CalendarClock className="size-3.5 text-slate-400" aria-hidden /> {dueLabel(d)}</span>
        </p>
        <StatusFlow ws={ws} reload={() => void load()} />
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Deadline" value={dayText(due) ?? "None"} hint={dueLabel(d)} tone={d !== null && d >= 0 && d <= 3 ? "border-red-300 bg-red-50/60" : ""} />
        <Stat label="Contract value" value={ws.contract_value !== null ? usd(ws.contract_value) : "Not set"} />
        <Stat label="Compliance" value={reqRows.length ? `${verified}/${reqRows.length} verified` : "No checklist"} hint={blockers ? `${blockers} mandatory open` : undefined} tone={blockers ? "border-amber-300 bg-amber-50/60" : ""} />
        <Stat label="Proposal" value={approved ? "Approved" : proposals.length ? `${proposals.length} draft${proposals.length === 1 ? "" : "s"}` : "None yet"} tone={approved ? "border-green-300 bg-green-50/60" : ""} />
        <Stat label="Estimate" value={total > 0 ? usd(total) : "Not priced"} />
      </div>

      <div role="tablist" aria-label="Bid sections" className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t}{t === "Analysis & Compliance" && blockers > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{blockers}</span>}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview ws={ws} notice={notice} steps={steps} blockers={blockers} changed={changed} reload={() => void load()} go={setTab} />}
      {tab === "Documents" && <Documents docs={docs} />}
      {tab === "Analysis & Compliance" && <Analysis ws={ws} reqs={reqs} docs={docs.rows ?? []} reload={() => void load()} />}
      {tab === "Proposal" && <Proposal ws={ws} blockers={blockers} reload={reloadAll} />}
      {tab === "Cost Estimate" && <Estimate lines={lines} />}
      {tab === "Timeline" && <Timeline wsId={ws.id} refreshKey={`${tick}:${docs.rows?.length}:${reqs.rows?.length}:${lines.rows?.length}`} />}
    </>
  );
}
