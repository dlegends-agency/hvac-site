import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, CheckCircle2, Circle, ExternalLink, Loader2, MapPin, Phone, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { BOOKING_TYPE_LABEL, dateLabel, timeLabel } from "@/lib/bookings";
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_STYLE, shortDate, usd,
  type Project, type ProjectActivity, type ProjectDocument, type ProjectExpense, type ProjectMember, type ProjectStatus, type ProjectTask, type Quotation,
} from "@/lib/projects";
import { getSupabaseBrowser } from "@/lib/supabase";
import { BookingCalendar } from "./BookingCalendar";
import { useContractor } from "./context";
import { EmailCustomer } from "./EmailCustomer";
import { useBookings } from "./useBookings";
import { useChildRows } from "./useProjects";
import { ago } from "./useMyLeads";

const TABS = ["Overview", "Scope & Tasks", "Bookings", "Quotes & Expenses", "Documents", "Timeline"] as const;
type Tab = (typeof TABS)[number];
const ACTIVITY_LABEL: Record<string, string> = { created: "Created", status: "Status", note: "Note", call: "Call", email: "Email", follow_up: "Follow-up", unlock: "Unlocked", converted: "Converted", task: "Task", document: "Document", team: "Team", expense: "Expense", quotation: "Quotation" };
const STATUS_ORDER: Record<Quotation["status"], string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
/** The steps a job normally moves through, left to right. Lost or cancelled sits apart. */
const FLOW: ProjectStatus[] = PROJECT_STATUSES.filter((s) => s !== "lost_cancelled");

const input = `${inputClass} !py-1.5 !text-sm`;
const L = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => (
  <label className={`block text-xs font-semibold text-slate-600 ${className}`}>{label}<span className="mt-1 block font-normal">{children}</span></label>
);
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

/** The status as a path: click a step to move the job there. */
function StatusFlow({ p, onSaved }: { p: Project; onSaved: () => void }) {
  const { save, busy } = useSave(p, onSaved);
  const at = FLOW.indexOf(p.status); // -1 when lost or cancelled
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Project status">
      {FLOW.map((s, i) => (
        <button key={s} type="button" disabled={busy || p.status === s} onClick={() => void save({ status: s })} aria-pressed={p.status === s}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${p.status === s ? "bg-primary text-white" : at > i ? "bg-blue-50 text-primary hover:bg-blue-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          {at > i && <Check className="size-3" aria-hidden />}{PROJECT_STATUS_LABEL[s]}
        </button>
      ))}
      <button type="button" disabled={busy || p.status === "lost_cancelled"} onClick={() => void save({ status: "lost_cancelled" })} aria-pressed={p.status === "lost_cancelled"}
        className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${p.status === "lost_cancelled" ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Lost or cancelled</button>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: ReactNode; tone?: string }) {
  return <div className={`rounded-xl border bg-white px-3.5 py-2.5 ${tone || "border-slate-200"}`}><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="truncate text-base font-bold text-navy">{value}</p></div>;
}

function Overview({ p, onSaved, steps, upcoming, go }: {
  p: Project; onSaved: () => void; steps: { label: string; done: boolean; tab: Tab }[]; upcoming: ReturnType<typeof useBookings>["rows"]; go: (t: Tab) => void;
}) {
  const { save, busy, msg } = useSave(p, onSaved);
  const { listing } = useContractor();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim() || null;
    const v = String(f.get("value") ?? "").trim();
    void save({ name: String(f.get("name") ?? "").trim() || p.name, contract_value: v ? Number(v) : null, start_on: g("start"), expected_end_on: g("end"), client_name: g("cname"), client_company: g("company"), client_phone: g("phone"), client_email: g("email"), location: g("location") });
  }
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <form key={p.updated_at} onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-navy">Project and client</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <L label="Project name" className="sm:col-span-2 lg:col-span-4"><input name="name" defaultValue={p.name} maxLength={300} required className={input} /></L>
          <L label="Contract value ($)"><input name="value" type="number" min="0" step="0.01" defaultValue={p.contract_value ?? ""} className={input} /></L>
          <L label="Start date"><input name="start" type="date" defaultValue={p.start_on ?? ""} className={input} /></L>
          <L label="Expected completion"><input name="end" type="date" defaultValue={p.expected_end_on ?? ""} className={input} /></L>
          <L label="Project location"><input name="location" defaultValue={p.location ?? ""} maxLength={300} className={input} /></L>
          <L label="Client name"><input name="cname" defaultValue={p.client_name ?? ""} maxLength={200} className={input} /></L>
          <L label="Company"><input name="company" defaultValue={p.client_company ?? ""} maxLength={200} className={input} /></L>
          <L label="Phone"><input name="phone" defaultValue={p.client_phone ?? ""} maxLength={60} className={input} /></L>
          <L label="Email"><input name="email" type="email" defaultValue={p.client_email ?? ""} maxLength={200} className={input} /></L>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
          {p.client_phone && <a href={`tel:${p.client_phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50"><Phone className="size-3.5" aria-hidden /> Call</a>}
          {p.client_email && p.lead_kind === "lead" && p.lead_item_id && listing
            ? <EmailCustomer leadId={p.lead_item_id} listingId={listing.id} businessName={listing.business_name} customerName={(p.client_name ?? "").split(" ")[0] || "there"} issue={p.name} email={p.client_email} label="Email client" />
            : p.client_email && p.lead_kind
              ? <Link to="/contractor/my-leads" className="text-sm font-semibold text-primary hover:underline">Email from My Leads</Link>
              : p.client_email && <a href={`mailto:${p.client_email}`} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">Email</a>}
          {p.lead_kind === "lead" && <Link to={`/contractor/messages?lead=${p.lead_item_id}`} className="text-sm font-semibold text-primary hover:underline">Messages</Link>}
          {p.status !== "completed" && p.status !== "lost_cancelled" && (
            <button type="button" disabled={busy} onClick={() => void save({ status: "completed" })} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="size-4" aria-hidden /> Mark as Completed</button>
          )}
          <span role="status" className="text-sm text-slate-600">{msg}</span>
        </div>
      </form>

      <div className="space-y-4">
        <Card title="Next steps" aside={`${done} of ${steps.length}`}>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Steps done"><div className="h-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          <ul className="space-y-0.5">
            {steps.map((s) => (
              <li key={s.label}>
                <button type="button" onClick={() => go(s.tab)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-slate-50">
                  {s.done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="size-4 shrink-0 text-slate-300" aria-hidden />}
                  <span className={s.done ? "text-slate-500 line-through" : "font-medium text-navy"}>{s.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{s.tab}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Upcoming bookings" aside={<button type="button" onClick={() => go("Bookings")} className="font-semibold text-primary hover:underline">Open calendar</button>}>
          {upcoming === null ? <p className="text-sm text-slate-500">Loading…</p> : upcoming.length === 0 ? <p className="text-sm text-slate-600">Nothing booked yet.</p> : (
            <ul className="space-y-2 text-sm">
              {upcoming.map((b) => <li key={b.id} className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span><strong className="text-navy">{b.title}</strong><br /><span className="text-xs text-slate-600">{BOOKING_TYPE_LABEL[b.type]} · {dateLabel(b.starts_at)}, {timeLabel(b.starts_at)}</span></span></li>)}
            </ul>
          )}
        </Card>
        {p.lead_kind && (
          <Card title="Original lead">
            <p className="text-sm text-slate-700">Came from an accepted {p.lead_kind === "lead" ? "customer request" : p.lead_kind === "permit" ? "building permit" : "government bid"}. The lead, its payment and history stay in My Leads.</p>
            <Link to="/contractor/my-leads" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">Open My Leads <ExternalLink className="size-3.5" aria-hidden /></Link>
          </Card>
        )}
      </div>
    </div>
  );
}

function Scope({ p, onSaved, tasks, team }: { p: Project; onSaved: () => void; tasks: ReturnType<typeof useChildRows<ProjectTask>>; team: ReturnType<typeof useChildRows<ProjectMember>> }) {
  const { save, busy, msg } = useSave(p, onSaved);
  const members = team.rows ?? [];
  const list = [...(tasks.rows ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
  const done = list.filter((t) => t.done).length;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim() || null;
    void save({ description: g("description"), scope: g("scope"), industry: g("industry"), trade: g("trade"), notes: g("notes") });
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <form key={p.updated_at} onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-navy">Scope of work</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="What the customer asked for" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={p.description ?? ""} maxLength={4000} className={`${input} [field-sizing:content] max-h-40`} /></L>
          <L label="What is included, what is not, equipment and materials" className="sm:col-span-2"><textarea name="scope" rows={5} defaultValue={p.scope ?? ""} maxLength={4000} placeholder="Replace the 3-ton condenser, new line set, 1-year labor warranty. Not included: ductwork." className={`${input} [field-sizing:content] max-h-72`} /></L>
          <L label="Industry"><input name="industry" defaultValue={p.industry ?? ""} maxLength={120} className={input} /></L>
          <L label="Trade"><input name="trade" defaultValue={p.trade ?? ""} maxLength={120} className={input} /></L>
          <L label="Notes for yourself" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={p.notes ?? ""} maxLength={4000} className={`${input} [field-sizing:content] max-h-40`} /></L>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save scope</Button>
          <span role="status" className="text-sm text-slate-600">{msg}</span>
        </div>
      </form>

      <div className="space-y-4">
        <Card title="Tasks and scheduled work" aside={list.length ? `${done} of ${list.length} done` : undefined}>
          <form className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_8.5rem_auto]" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const title = String(f.get("title") ?? "").trim();
            if (title) void tasks.add({ title, assignee: String(f.get("assignee") ?? "") || null, due_on: String(f.get("due") ?? "") || null }).then((ok) => ok && form.reset());
          }}>
            <input name="title" required maxLength={300} className={`${input} col-span-2 sm:col-span-1`} placeholder="Add a task: install condenser, site visit…" aria-label="Task" />
            <select name="assignee" className={input} aria-label="Assigned to"><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}</select>
            <input name="due" type="date" className={input} aria-label="Due date" />
            <Button type="submit" className="!rounded-full !px-4 !py-1.5 text-sm">Add</Button>
          </form>
          {tasks.rows === null ? <p className="text-sm text-slate-500">Loading…</p> : list.length === 0 ? <Empty>No tasks yet. Add the first step of the job.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {list.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <input type="checkbox" checked={t.done} onChange={(e) => void tasks.change(t.id, { done: e.target.checked })} aria-label={`Done: ${t.title}`} className="size-4 rounded border-slate-300" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${t.done ? "text-slate-400 line-through" : "text-navy"}`}>{t.title}</p>
                    {(t.assignee || t.due_on) && <p className="text-xs text-slate-500">{[t.assignee, t.due_on ? `Due ${shortDate(t.due_on)}` : null].filter(Boolean).join(" · ")}</p>}
                  </div>
                  <RemoveBtn label={`Remove task: ${t.title}`} onClick={() => void tasks.remove(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Assigned team">
          <form className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const name = String(f.get("name") ?? "").trim();
            if (name) void team.add({ name, role: String(f.get("role") ?? "").trim() || null, phone: String(f.get("phone") ?? "").trim() || null }).then((ok) => ok && form.reset());
          }}>
            <input name="name" required maxLength={120} placeholder="Name" aria-label="Team member name" className={input} />
            <input name="role" maxLength={120} placeholder="Role" aria-label="Role" className={input} />
            <input name="phone" maxLength={60} placeholder="Phone" aria-label="Phone" className={input} />
            <Button type="submit" variant="secondary" className="!rounded-full !px-4 !py-1.5 text-sm">Add</Button>
          </form>
          {members.length === 0 ? <Empty>No one assigned yet.</Empty> : (
            <ul className="flex flex-wrap gap-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pr-2 pl-3 text-sm">
                  <UserRound className="size-3.5 text-slate-500" aria-hidden />
                  <span><strong className="text-navy">{m.name}</strong>{m.role ? ` · ${m.role}` : ""}{m.phone ? <> · <a href={`tel:${m.phone}`} className="text-primary hover:underline">{m.phone}</a></> : null}</span>
                  <RemoveBtn label={`Remove ${m.name}`} onClick={() => void team.remove(m.id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Money({ p, quotes, exp, onSaved }: { p: Project; quotes: ReturnType<typeof useChildRows<Quotation>>; exp: ReturnType<typeof useChildRows<ProjectExpense>>; onSaved: () => void }) {
  const spent = (exp.rows ?? []).reduce((s, e) => s + Number(e.amount_usd), 0);
  const accepted = (quotes.rows ?? []).filter((q) => q.status === "accepted").reduce((s, q) => s + Number(q.amount_usd), 0);
  const open = (quotes.rows ?? []).filter((q) => q.status === "sent").reduce((s, q) => s + Number(q.amount_usd), 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contract value" value={usd(p.contract_value)} />
        <Stat label="Accepted quotes" value={usd(accepted)} tone="border-emerald-200 bg-emerald-50/50" />
        <Stat label="Waiting on the customer" value={usd(open)} />
        <Stat label="Expenses" value={usd(spent)} tone="border-amber-200 bg-amber-50/50" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Quotations and contracts">
          <form className="mb-3 grid grid-cols-[minmax(0,1fr)_7rem_6.5rem_auto] gap-2" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const status = String(f.get("status"));
            const today = new Date().toISOString().slice(0, 10);
            void quotes.add({ listing_id: p.listing_id, title: String(f.get("title") ?? "").trim(), amount_usd: Number(f.get("amount")), status, sent_on: status === "draft" ? null : today, accepted_on: status === "accepted" ? today : null }).then((ok) => { if (ok) { form.reset(); onSaved(); } });
          }}>
            <input name="title" required maxLength={200} className={input} placeholder="Change order, service agreement…" aria-label="Quotation or contract" />
            <input name="amount" type="number" min="0" step="0.01" required className={input} placeholder="$ amount" aria-label="Amount" />
            <select name="status" defaultValue="sent" className={input} aria-label="Status">{Object.entries(STATUS_ORDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <Button type="submit" className="!rounded-full !px-4 !py-1.5 text-sm">Add</Button>
          </form>
          {quotes.error && <p className="mb-2 text-sm text-red-700">{quotes.error}</p>}
          {quotes.rows === null ? <p className="text-sm text-slate-500">Loading…</p> : quotes.rows.length === 0 ? <Empty>No quotations yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {quotes.rows.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{q.title}</p>
                    <p className="text-xs text-slate-500">{usd(q.amount_usd)}{q.sent_on ? ` · sent ${shortDate(q.sent_on)}` : ""}{q.accepted_on ? ` · accepted ${shortDate(q.accepted_on)}` : ""}</p>
                  </div>
                  <select value={q.status} aria-label={`Status of ${q.title}`} onChange={(e) => void quotes.change(q.id, { status: e.target.value, accepted_on: e.target.value === "accepted" ? new Date().toISOString().slice(0, 10) : null })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                    {Object.entries(STATUS_ORDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <RemoveBtn label={`Remove ${q.title}`} onClick={() => void quotes.remove(q.id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Expenses" aside={<>Total <strong className="text-navy">{usd(spent)}</strong>{p.contract_value !== null && <> · left {usd(Number(p.contract_value) - spent)}</>}</>}>
          <form className="mb-3 grid grid-cols-[minmax(0,1fr)_7rem_8.5rem_auto] gap-2" onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            void exp.add({ description: String(f.get("description") ?? "").trim(), amount_usd: Number(f.get("amount")), spent_on: String(f.get("date") ?? "") || new Date().toISOString().slice(0, 10) }).then((ok) => ok && form.reset());
          }}>
            <input name="description" required maxLength={300} className={input} placeholder="Condenser unit, labor, permit fee…" aria-label="Expense" />
            <input name="amount" type="number" min="0" step="0.01" required className={input} placeholder="$ amount" aria-label="Amount" />
            <input name="date" type="date" className={input} aria-label="Date" />
            <Button type="submit" className="!rounded-full !px-4 !py-1.5 text-sm">Add</Button>
          </form>
          {exp.error && <p className="mb-2 text-sm text-red-700">{exp.error}</p>}
          {exp.rows === null ? <p className="text-sm text-slate-500">Loading…</p> : exp.rows.length === 0 ? <Empty>No expenses yet.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {exp.rows.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-navy">{e.description}</p><p className="text-xs text-slate-500">{shortDate(e.spent_on)}</p></div>
                  <p className="text-sm font-semibold text-navy">{usd(e.amount_usd)}</p>
                  <RemoveBtn label={`Remove ${e.description}`} onClick={() => void exp.remove(e.id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Documents({ docs }: { docs: ReturnType<typeof useChildRows<ProjectDocument>> }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card title="Add a document">
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          void docs.add({ name: String(f.get("name") ?? "").trim(), url: String(f.get("url") ?? "").trim(), category: String(f.get("category") ?? "") || null }).then((ok) => ok && form.reset());
        }}>
          <L label="Name"><input name="name" required maxLength={200} className={input} placeholder="Signed contract" /></L>
          <L label="Link (https://…)"><input name="url" type="url" required pattern="https?://.+" maxLength={1000} className={input} placeholder="Google Drive, Dropbox, OneDrive…" /></L>
          <L label="Type"><select name="category" className={input}><option value="">Other</option><option>Contract</option><option>Quotation</option><option>Drawing</option><option>Permit</option><option>Photo</option><option>Invoice</option></select></L>
          <Button type="submit" className="!rounded-full !py-1.5 text-sm">Add document</Button>
          <p className="text-xs text-slate-500">Paste a link to a file in Google Drive, Dropbox or OneDrive. Direct upload comes later.</p>
        </form>
      </Card>
      <Card title="Documents" aside={docs.rows ? `${docs.rows.length}` : undefined}>
        {docs.error && <p className="mb-2 text-sm text-red-700">{docs.error}</p>}
        {docs.rows === null ? <p className="text-sm text-slate-500">Loading…</p> : docs.rows.length === 0 ? <Empty>No documents yet.</Empty> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {docs.rows.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><span className="truncate">{d.name}</span> <ExternalLink className="size-3.5 shrink-0" aria-hidden /></a>
                  <p className="text-xs text-slate-500">{d.category ?? "Other"} · {ago(d.created_at)}</p>
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card title="Add a note">
        <form onSubmit={(e) => void add(e)}>
          <label htmlFor="proj-note" className="sr-only">Add a note</label>
          <textarea id="proj-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder="What happened, what the customer said, what is next…" className={inputClass} />
          <Button type="submit" disabled={busy || !note.trim()} className="mt-2 !rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Add note</Button>
        </form>
      </Card>
      <Card title="Everything that happened" aside={rows ? `${rows.length}` : undefined}>
        {rows === null ? <p className="text-sm text-slate-500">Loading…</p> : rows.length === 0 ? <Empty>Nothing yet.</Empty> : (
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
      </Card>
    </div>
  );
}

const ORDER_TASKS = { column: "created_at", ascending: true };
const ORDER_NEW = { column: "created_at", ascending: false };

/** One project. The page reads as a path: where the job is, what to do next, then the parts of running it. */
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
  const bookings = useBookings(true);
  const [nowMs] = useState(() => Date.now());

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

  const mine = useMemo(() => (bookings.rows ?? []).filter((b) => project && (b.project_id === project.id || (project.lead_kind !== null && b.lead_kind === project.lead_kind && b.lead_item_id === project.lead_item_id))), [bookings.rows, project]);
  const upcoming = bookings.rows === null ? null : mine.filter((b) => b.status === "scheduled" && Date.parse(b.ends_at) >= nowMs).slice(0, 3);

  if (!listing) return <p className="text-slate-600">Loading…</p>;
  if (project === undefined) return <p className="text-slate-600">Loading…</p>;
  if (project === null) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-bold text-navy">This project is not available</h1>
        <p className="mt-1 text-sm text-slate-700">It may have been removed. <Link to="/contractor/projects" className="font-semibold text-primary underline">Back to My Projects</Link></p>
      </section>
    );
  }

  const taskRows = tasks.rows ?? [];
  const doneTasks = taskRows.filter((t) => t.done).length;
  const pct = taskRows.length ? Math.round((doneTasks / taskRows.length) * 100) : 0;
  const spent = (expenses.rows ?? []).reduce((s, e) => s + Number(e.amount_usd), 0);
  const next = upcoming?.[0];
  const steps: { label: string; done: boolean; tab: Tab }[] = [
    { label: "Set the start and end dates", done: Boolean(project.start_on && project.expected_end_on), tab: "Overview" },
    { label: "Write the scope of work", done: Boolean(project.scope), tab: "Scope & Tasks" },
    { label: "Add the tasks", done: taskRows.length > 0, tab: "Scope & Tasks" },
    { label: "Book the visit or the job", done: mine.length > 0, tab: "Bookings" },
    { label: "Record the quotation or contract", done: (quotes.rows ?? []).length > 0, tab: "Quotes & Expenses" },
    { label: "Add the contract and photos", done: (docs.rows ?? []).length > 0, tab: "Documents" },
  ];
  const del = project.lead_item_id === null
    ? async () => { if (window.confirm("Delete this project and everything in it? This cannot be undone.")) { await getSupabaseBrowser().from("projects").delete().eq("id", project.id); navigate("/contractor/projects"); } }
    : null;

  return (
    <>
      <Link to="/contractor/projects" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden /> My Projects</Link>
      <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 title={project.name} className="line-clamp-2 text-xl font-bold text-navy sm:text-2xl">{project.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PROJECT_STATUS_STYLE[project.status]}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
              {(project.client_name || project.client_company) && <span className="inline-flex items-center gap-1"><UserRound className="size-3.5 text-slate-400" aria-hidden /> {[project.client_name, project.client_company].filter(Boolean).join(" · ")}</span>}
              {project.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-slate-400" aria-hidden /> {project.location}</span>}
              {(project.start_on || project.expected_end_on) && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 text-slate-400" aria-hidden /> {shortDate(project.start_on)} to {shortDate(project.expected_end_on)}</span>}
            </p>
          </div>
          {del && <Button variant="secondary" onClick={() => void del()} className="!rounded-full text-sm"><Trash2 className="size-4" aria-hidden /> Delete</Button>}
        </div>
        <StatusFlow p={project} onSaved={() => void load()} />
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Contract value" value={usd(project.contract_value)} />
        <Stat label="Expenses" value={usd(spent)} />
        <Stat label="Left after expenses" value={project.contract_value !== null ? usd(Number(project.contract_value) - spent) : "Not set"} />
        <Stat label="Tasks done" value={taskRows.length ? `${doneTasks}/${taskRows.length} (${pct}%)` : "No tasks"} />
        <Stat label="Next booking" value={next ? `${dateLabel(next.starts_at).replace(/, \d{4}$/, "")}, ${timeLabel(next.starts_at)}` : "None"} />
      </div>

      <div role="tablist" aria-label="Project sections" className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && <Overview p={project} onSaved={() => void load()} steps={steps} upcoming={upcoming} go={setTab} />}
      {tab === "Scope & Tasks" && <Scope p={project} onSaved={() => void load()} tasks={tasks} team={team} />}
      {tab === "Bookings" && (
        <BookingCalendar listingId={listing.id} projectId={project.id} link={project.lead_kind && project.lead_item_id ? { kind: project.lead_kind, itemId: project.lead_item_id } : undefined}
          defaults={{ title: project.name, customer: project.client_name, location: project.location }} />
      )}
      {tab === "Quotes & Expenses" && <Money p={project} quotes={quotes} exp={expenses} onSaved={() => setTick((t) => t + 1)} />}
      {tab === "Documents" && <Documents docs={docs} />}
      {tab === "Timeline" && <Timeline projectId={project.id} refreshKey={`${tick}:${refreshed}`} />}
    </>
  );
}
