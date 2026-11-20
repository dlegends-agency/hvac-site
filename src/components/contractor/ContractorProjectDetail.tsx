import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_STYLE, shortDate, usd,
  type Project, type ProjectActivity, type ProjectDocument, type ProjectExpense, type ProjectMember, type ProjectStatus, type ProjectTask, type Quotation,
} from "@/lib/projects";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useContractor } from "./context";
import { EmailCustomer } from "./EmailCustomer";
import { useChildRows } from "./useProjects";
import { ago } from "./useMyLeads";

const TABS = ["Overview", "Client Information", "Scope of Work", "Tasks & Schedule", "Documents", "Quotations & Contracts", "Expenses", "Activity Timeline"] as const;
type Tab = (typeof TABS)[number];
const ACTIVITY_LABEL: Record<string, string> = { created: "Created", status: "Status", note: "Note", call: "Call", email: "Email", follow_up: "Follow-up", unlock: "Unlocked", converted: "Converted", task: "Task", document: "Document", team: "Team", expense: "Expense", quotation: "Quotation" };
const STATUS_ORDER: Record<Quotation["status"], string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };

const L = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => (
  <label className={`block text-sm font-medium text-slate-700 ${className}`}>{label}<span className="mt-1 block">{children}</span></label>
);
const input = `${inputClass} !py-2`;

/** Edits a few columns of the project and saves them together. */
function useSave(project: Project, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = useCallback(async (patch: Partial<Project>) => {
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().from("projects").update(patch).eq("id", project.id);
    setBusy(false);
    setMsg(error ? "That did not save. Please try again." : "Saved.");
    if (!error) onSaved();
    return !error;
  }, [project.id, onSaved]);
  return { save, busy, msg };
}

function Overview({ p, onSaved, tasks, expenses }: { p: Project; onSaved: () => void; tasks: ProjectTask[]; expenses: ProjectExpense[] }) {
  const { save, busy, msg } = useSave(p, onSaved);
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const spent = expenses.reduce((s, e) => s + Number(e.amount_usd), 0);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = String(f.get("value") ?? "").trim();
    void save({ name: String(f.get("name") ?? "").trim() || p.name, status: String(f.get("status")) as ProjectStatus, contract_value: v ? Number(v) : null, start_on: String(f.get("start") ?? "") || null, expected_end_on: String(f.get("end") ?? "") || null });
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form key={p.updated_at} onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <L label="Project name" className="sm:col-span-2"><input name="name" defaultValue={p.name} maxLength={300} required className={input} /></L>
        <L label="Status"><select name="status" defaultValue={p.status} className={input}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}</select></L>
        <L label="Contract value ($)"><input name="value" type="number" min="0" step="0.01" defaultValue={p.contract_value ?? ""} className={input} /></L>
        <L label="Start date"><input name="start" type="date" defaultValue={p.start_on ?? ""} className={input} /></L>
        <L label="Expected completion"><input name="end" type="date" defaultValue={p.expected_end_on ?? ""} className={input} /></L>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
          {p.status !== "completed" && p.status !== "lost_cancelled" && (
            <button type="button" disabled={busy} onClick={() => void save({ status: "completed" })} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="size-4" aria-hidden /> Mark as Completed</button>
          )}
          <span role="status" className="text-sm text-slate-600">{msg}</span>
        </div>
      </form>
      <div className="space-y-4">
        <Panel title="Progress">
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks done"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-sm text-slate-700">{tasks.length ? `${done} of ${tasks.length} tasks done (${pct}%)` : "Add tasks to track progress."}</p>
        </Panel>
        <Panel title="Money">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Contract value</dt><dd className="font-semibold text-navy">{usd(p.contract_value)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Expenses so far</dt><dd className="font-semibold text-navy">{usd(spent)}</dd></div>
            {p.contract_value !== null && <div className="flex justify-between border-t border-slate-100 pt-1"><dt className="text-slate-500">Left after expenses</dt><dd className="font-semibold text-navy">{usd(Number(p.contract_value) - spent)}</dd></div>}
          </dl>
        </Panel>
        {p.lead_kind && (
          <Panel title="Original lead">
            <p className="text-sm text-slate-700">This project came from an accepted {p.lead_kind === "lead" ? "customer request" : p.lead_kind === "permit" ? "building permit" : "government bid"}. The lead, its purchase record and history stay in My Leads.</p>
            <Link to={`/contractor/leads?open=${p.lead_kind}:${p.lead_item_id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">Open the original lead <ExternalLink className="size-3.5" aria-hidden /></Link>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Client({ p, onSaved }: { p: Project; onSaved: () => void }) {
  const { save, busy, msg } = useSave(p, onSaved);
  const { listing } = useContractor();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim() || null;
    void save({ client_name: g("name"), client_company: g("company"), client_phone: g("phone"), client_email: g("email"), location: g("location") });
  }
  return (
    <form key={p.updated_at} onSubmit={submit} className="grid max-w-3xl gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <L label="Client name"><input name="name" defaultValue={p.client_name ?? ""} maxLength={200} className={input} /></L>
      <L label="Company"><input name="company" defaultValue={p.client_company ?? ""} maxLength={200} className={input} /></L>
      <L label="Phone"><input name="phone" defaultValue={p.client_phone ?? ""} maxLength={60} className={input} /></L>
      <L label="Email"><input name="email" type="email" defaultValue={p.client_email ?? ""} maxLength={200} className={input} /></L>
      <L label="Project location" className="sm:col-span-2"><input name="location" defaultValue={p.location ?? ""} maxLength={300} className={input} /></L>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save</Button>
        {p.client_phone && <a href={`tel:${p.client_phone}`} className="text-sm font-semibold text-primary hover:underline">Call</a>}
        {p.client_email && p.lead_kind === "lead" && p.lead_item_id && listing
          ? <EmailCustomer leadId={p.lead_item_id} listingId={listing.id} businessName={listing.business_name} customerName={(p.client_name ?? "").split(" ")[0] || "there"} issue={p.name} email={p.client_email} label="Email client" />
          : p.client_email && p.lead_kind
            ? <Link to="/contractor/my-leads" className="text-sm font-semibold text-primary hover:underline">Email from My Leads</Link>
            : p.client_email && <a href={`mailto:${p.client_email}`} className="text-sm font-semibold text-primary hover:underline">Email</a>}
        {p.lead_kind === "lead" && <Link to={`/contractor/messages?lead=${p.lead_item_id}`} className="text-sm font-semibold text-primary hover:underline">Messages</Link>}
        <span role="status" className="text-sm text-slate-600">{msg}</span>
      </div>
    </form>
  );
}

function Scope({ p, onSaved }: { p: Project; onSaved: () => void }) {
  const { save, busy, msg } = useSave(p, onSaved);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim() || null;
    void save({ description: g("description"), scope: g("scope"), industry: g("industry"), trade: g("trade"), notes: g("notes") });
  }
  return (
    <form key={p.updated_at} onSubmit={submit} className="grid max-w-3xl gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <L label="Project description" className="sm:col-span-2"><textarea name="description" rows={3} defaultValue={p.description ?? ""} maxLength={4000} className={input} /></L>
      <L label="Scope of work" className="sm:col-span-2"><textarea name="scope" rows={5} defaultValue={p.scope ?? ""} maxLength={4000} placeholder="What is included, what is not, equipment and materials…" className={input} /></L>
      <L label="Industry"><input name="industry" defaultValue={p.industry ?? ""} maxLength={120} className={input} /></L>
      <L label="Trade"><input name="trade" defaultValue={p.trade ?? ""} maxLength={120} className={input} /></L>
      <L label="Notes" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={p.notes ?? ""} maxLength={4000} className={input} /></L>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save</Button>
        <span role="status" className="text-sm text-slate-600">{msg}</span>
      </div>
    </form>
  );
}

const ORDER_TASKS = { column: "created_at", ascending: true };
const ORDER_NEW = { column: "created_at", ascending: false };

function Tasks({ tasks, team }: { tasks: ReturnType<typeof useChildRows<ProjectTask>>; team: ReturnType<typeof useChildRows<ProjectMember>> }) {
  const members = team.rows ?? [];
  const list = [...(tasks.rows ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <form className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const title = String(f.get("title") ?? "").trim();
          if (title) void tasks.add({ title, assignee: String(f.get("assignee") ?? "") || null, due_on: String(f.get("due") ?? "") || null }).then((ok) => ok && form.reset());
        }}>
          <L label="Task or scheduled work" className="min-w-52 flex-1"><input name="title" required maxLength={300} className={input} placeholder="Install condenser, site visit…" /></L>
          <L label="Assigned to"><select name="assignee" className={input}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}</select></L>
          <L label="Due / scheduled"><input name="due" type="date" className={input} /></L>
          <Button type="submit" className="!rounded-full !px-5 !py-2 text-sm">Add</Button>
        </form>
        {tasks.rows === null ? <p className="text-slate-600">Loading…</p> : list.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No tasks yet.</p> : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={t.done} onChange={(e) => void tasks.change(t.id, { done: e.target.checked })} aria-label={`Done: ${t.title}`} className="size-4 rounded border-slate-300" />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.done ? "text-slate-400 line-through" : "text-navy"}`}>{t.title}</p>
                  <p className="text-xs text-slate-500">{[t.assignee, t.due_on ? `Due ${shortDate(t.due_on)}` : null].filter(Boolean).join(" · ") || "No date or owner"}</p>
                </div>
                <button type="button" onClick={() => void tasks.remove(t.id)} aria-label={`Remove task: ${t.title}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Panel title="Assigned team">
        <form className="mb-3 grid gap-2" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const name = String(f.get("name") ?? "").trim();
          if (name) void team.add({ name, role: String(f.get("role") ?? "").trim() || null, phone: String(f.get("phone") ?? "").trim() || null }).then((ok) => ok && form.reset());
        }}>
          <input name="name" required maxLength={120} placeholder="Name" aria-label="Team member name" className={input} />
          <div className="flex gap-2">
            <input name="role" maxLength={120} placeholder="Role" aria-label="Role" className={input} />
            <input name="phone" maxLength={60} placeholder="Phone" aria-label="Phone" className={input} />
          </div>
          <Button type="submit" variant="secondary" className="!rounded-full !py-2 text-sm">Add team member</Button>
        </form>
        {members.length === 0 ? <p className="text-sm text-slate-500">No one assigned yet.</p> : (
          <ul className="space-y-2 text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2">
                <span><strong className="text-navy">{m.name}</strong>{m.role ? ` · ${m.role}` : ""}{m.phone ? <><br /><a href={`tel:${m.phone}`} className="text-primary hover:underline">{m.phone}</a></> : null}</span>
                <button type="button" onClick={() => void team.remove(m.id)} aria-label={`Remove ${m.name}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Documents({ docs }: { docs: ReturnType<typeof useChildRows<ProjectDocument>> }) {
  return (
    <div className="max-w-3xl">
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void docs.add({ name: String(f.get("name") ?? "").trim(), url: String(f.get("url") ?? "").trim(), category: String(f.get("category") ?? "") || null }).then((ok) => ok && form.reset());
      }}>
        <L label="Document name" className="min-w-40 flex-1"><input name="name" required maxLength={200} className={input} placeholder="Signed contract" /></L>
        <L label="Link (https://…)" className="min-w-52 flex-[2]"><input name="url" type="url" required pattern="https?://.+" maxLength={1000} className={input} placeholder="Google Drive, Dropbox, OneDrive…" /></L>
        <L label="Type"><select name="category" className={input}><option value="">Other</option><option>Contract</option><option>Quotation</option><option>Drawing</option><option>Permit</option><option>Photo</option><option>Invoice</option></select></L>
        <Button type="submit" className="!rounded-full !px-5 !py-2 text-sm">Add</Button>
      </form>
      <p className="mb-3 text-xs text-slate-500">Add a link to a file you keep in Google Drive, Dropbox or OneDrive. Direct file upload comes later.</p>
      {docs.error && <p className="mb-3 text-sm text-red-700">{docs.error}</p>}
      {docs.rows === null ? <p className="text-slate-600">Loading…</p> : docs.rows.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No documents yet.</p> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {docs.rows.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">{d.name} <ExternalLink className="size-3.5" aria-hidden /></a>
                <p className="text-xs text-slate-500">{d.category ?? "Other"} · added {ago(d.created_at)}</p>
              </div>
              <button type="button" onClick={() => void docs.remove(d.id)} aria-label={`Remove ${d.name}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Quotes({ p, quotes, onSaved }: { p: Project; quotes: ReturnType<typeof useChildRows<Quotation>>; onSaved: () => void }) {
  return (
    <div className="max-w-3xl">
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const status = String(f.get("status"));
        const today = new Date().toISOString().slice(0, 10);
        void quotes.add({ listing_id: p.listing_id, title: String(f.get("title") ?? "").trim(), amount_usd: Number(f.get("amount")), status, sent_on: status === "draft" ? null : today, accepted_on: status === "accepted" ? today : null }).then((ok) => { if (ok) { form.reset(); onSaved(); } });
      }}>
        <L label="Quotation or contract" className="min-w-48 flex-1"><input name="title" required maxLength={200} className={input} placeholder="Change order, service agreement…" /></L>
        <L label="Amount ($)"><input name="amount" type="number" min="0" step="0.01" required className={input} /></L>
        <L label="Status"><select name="status" defaultValue="sent" className={input}>{Object.entries(STATUS_ORDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <Button type="submit" className="!rounded-full !px-5 !py-2 text-sm">Add</Button>
      </form>
      {quotes.error && <p className="mb-3 text-sm text-red-700">{quotes.error}</p>}
      {quotes.rows === null ? <p className="text-slate-600">Loading…</p> : quotes.rows.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No quotations yet.</p> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {quotes.rows.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{q.title}</p>
                <p className="text-xs text-slate-500">{usd(q.amount_usd)}{q.sent_on ? ` · sent ${shortDate(q.sent_on)}` : ""}{q.accepted_on ? ` · accepted ${shortDate(q.accepted_on)}` : ""}{q.notes ? ` · ${q.notes}` : ""}</p>
              </div>
              <select value={q.status} aria-label={`Status of ${q.title}`} onChange={(e) => void quotes.change(q.id, { status: e.target.value, accepted_on: e.target.value === "accepted" ? new Date().toISOString().slice(0, 10) : null })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                {Object.entries(STATUS_ORDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" onClick={() => void quotes.remove(q.id)} aria-label={`Remove ${q.title}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Expenses({ p, exp }: { p: Project; exp: ReturnType<typeof useChildRows<ProjectExpense>> }) {
  const total = (exp.rows ?? []).reduce((s, e) => s + Number(e.amount_usd), 0);
  return (
    <div className="max-w-3xl">
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void exp.add({ description: String(f.get("description") ?? "").trim(), amount_usd: Number(f.get("amount")), spent_on: String(f.get("date") ?? "") || new Date().toISOString().slice(0, 10) }).then((ok) => ok && form.reset());
      }}>
        <L label="Expense" className="min-w-48 flex-1"><input name="description" required maxLength={300} className={input} placeholder="Condenser unit, labor, permit fee…" /></L>
        <L label="Amount ($)"><input name="amount" type="number" min="0" step="0.01" required className={input} /></L>
        <L label="Date"><input name="date" type="date" className={input} /></L>
        <Button type="submit" className="!rounded-full !px-5 !py-2 text-sm">Add expense</Button>
      </form>
      <p className="mb-3 text-sm text-slate-700">Total expenses <strong className="text-navy">{usd(total)}</strong>{p.contract_value !== null && <> of a {usd(p.contract_value)} contract</>}</p>
      {exp.error && <p className="mb-3 text-sm text-red-700">{exp.error}</p>}
      {exp.rows === null ? <p className="text-slate-600">Loading…</p> : exp.rows.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-600">No expenses yet.</p> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {exp.rows.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium text-navy">{e.description}</p><p className="text-xs text-slate-500">{shortDate(e.spent_on)}</p></div>
              <p className="text-sm font-semibold text-navy">{usd(e.amount_usd)}</p>
              <button type="button" onClick={() => void exp.remove(e.id)} aria-label={`Remove ${e.description}`} className="text-slate-400 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Timeline({ projectId, refreshKey }: { projectId: string; refreshKey: string }) {
  const [rows, setRows] = useState<ProjectActivity[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await getSupabaseBrowser().from("project_activities").select("*").eq("project_id", projectId).order("id", { ascending: false }).limit(300);
    setRows((data as ProjectActivity[] | null) ?? []);
  }, [projectId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load, refreshKey]);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await getSupabaseBrowser().from("project_activities").insert({ project_id: projectId, type: "note", body: note.trim() });
    setBusy(false);
    if (!error) { setNote(""); void load(); }
  }
  return (
    <div className="max-w-3xl">
      <form onSubmit={(e) => void add(e)} className="mb-4">
        <label htmlFor="proj-note" className="sr-only">Add a note</label>
        <textarea id="proj-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Add a note to the project…" className={inputClass} />
        <Button type="submit" disabled={busy || !note.trim()} className="mt-2 !rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Add note</Button>
      </form>
      {rows === null ? <p className="text-slate-600">Loading…</p> : rows.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
        <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
          {rows.map((a) => (
            <li key={a.id}>
              <span className="font-semibold text-navy">{ACTIVITY_LABEL[a.type] ?? a.type}</span>
              <span className="ml-2 text-xs text-slate-500">{ago(a.created_at)}</span>
              {a.body && <p className="break-words whitespace-pre-line text-slate-700">{a.body}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One project, with every part of running the job in its own tab. */
export default function ContractorProjectDetail() {
  const { id = "" } = useParams();
  const { listing } = useContractor();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("Overview");
  const [tick, setTick] = useState(0);
  const tasks = useChildRows<ProjectTask>("project_tasks", id, ORDER_TASKS);
  const team = useChildRows<ProjectMember>("project_team", id, ORDER_TASKS);
  const docs = useChildRows<ProjectDocument>("project_documents", id, ORDER_NEW);
  const quotes = useChildRows<Quotation>("quotations", id, ORDER_NEW);
  const expenses = useChildRows<ProjectExpense>("project_expenses", id, ORDER_NEW);

  const load = useCallback(async () => {
    const { data } = await getSupabaseBrowser().from("projects").select("*").eq("id", id).maybeSingle();
    setProject((data as Project | null) ?? null);
    setTick((t) => t + 1);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    if (listing) void load();
  }, [listing, load]);
  // Anything added in a tab also shows on the timeline.
  const refreshed = [tasks.rows?.length, tasks.rows?.filter((t) => t.done).length, docs.rows?.length, team.rows?.length, expenses.rows?.length, quotes.rows?.length].join(":");

  if (!listing) return <PageTitle title="Project" />;
  if (project === undefined) return <p className="text-slate-600">Loading…</p>;
  if (project === null) {
    return (
      <>
        <PageTitle title="Project not found" />
        <Panel title="This project is not available"><p className="text-sm text-slate-700">It may have been removed. <Link to="/contractor/projects" className="font-semibold text-primary underline">Back to My Projects</Link></p></Panel>
      </>
    );
  }

  const del = project.lead_item_id === null
    ? async () => { if (window.confirm("Delete this project and everything in it? This cannot be undone.")) { await getSupabaseBrowser().from("projects").delete().eq("id", project.id); navigate("/contractor/projects"); } }
    : null;

  return (
    <>
      <Link to="/contractor/projects" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden /> My Projects</Link>
      <PageTitle title={project.name} description={<span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PROJECT_STATUS_STYLE[project.status]}`}>{PROJECT_STATUS_LABEL[project.status]}</span>}>
        {del && <Button variant="secondary" onClick={() => void del()} className="!rounded-full text-sm"><Trash2 className="size-4" aria-hidden /> Delete</Button>}
      </PageTitle>

      <div role="tablist" aria-label="Project sections" className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && <Overview p={project} onSaved={() => void load()} tasks={tasks.rows ?? []} expenses={expenses.rows ?? []} />}
      {tab === "Client Information" && <Client p={project} onSaved={() => void load()} />}
      {tab === "Scope of Work" && <Scope p={project} onSaved={() => void load()} />}
      {tab === "Tasks & Schedule" && <Tasks tasks={tasks} team={team} />}
      {tab === "Documents" && <Documents docs={docs} />}
      {tab === "Quotations & Contracts" && <Quotes p={project} quotes={quotes} onSaved={() => setTick((t) => t + 1)} />}
      {tab === "Expenses" && <Expenses p={project} exp={expenses} />}
      {tab === "Activity Timeline" && <Timeline projectId={project.id} refreshKey={`${tick}:${refreshed}`} />}
    </>
  );
}
