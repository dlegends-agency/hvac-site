import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BellRing, CalendarClock, Check, ChevronDown, FileText, Loader2, Mail, MapPin, MessageSquarePlus, Phone, Receipt, ArrowRightCircle } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";
import { useContractor } from "./context";
import { KIND_LABEL, KIND_STYLE, STAGE_LABEL, STAGE_STYLE, stagesFor, type HubItem, type PipelineRow, type Stage, useLeadHub } from "./useLeadHub";
import { ago } from "./useMyLeads";

type TabId = "all" | "new" | "contacted" | "follow_up" | "interested" | "converted" | "lost";
const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All Leads" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "follow_up", label: "Follow-Up" },
  { id: "interested", label: "Interested" },
  { id: "converted", label: "Converted" },
  { id: "lost", label: "Lost" },
];
/** Which tab a stage belongs to. A quote sent, a bid submitted and an accepted offer are all "Interested" until the lead becomes a project. */
const tabOf = (s: Stage): Exclude<TabId, "all"> =>
  s === "saved" || s === "new" ? "new" : s === "contacted" ? "contacted" : s === "follow_up" ? "follow_up" : s === "converted" ? "converted" : s === "lost" ? "lost" : "interested";

interface Receipt { kind: string; item_id: string; unlocked_at: string; unlock_cents: number | null; unlock_ref: string | null }
interface Activity { created_at: string; type: string; body: string | null }
interface Contact { name: string | null; company: string | null; position: string | null; phone: string | null; email: string | null }

const ACTIVITY_LABEL: Record<string, string> = { status: "Status", note: "Note", follow_up: "Follow-up", call: "Call", email: "Email", unlock: "Unlocked", converted: "Converted" };
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined });
const money = (n: number | null) => (n === null ? "Not listed" : `$${Math.round(n).toLocaleString("en-US")}`);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex gap-2 text-sm"><dt className="w-24 shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 flex-1 break-words text-slate-800">{children}</dd></div>;
}

function LeadCard({ r, item, contact, description, receipt, plan, projectId, onChanged, update }: {
  r: PipelineRow; item: HubItem; contact: Contact; description: string; receipt: Receipt | null; plan: string; projectId: string | null;
  onChanged: () => void; update: (patch: Partial<Pick<PipelineRow, "stage" | "follow_up_on">>) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<null | "follow" | "note" | "details" | "convert">(null);
  const [value, setValue] = useState(r.amount_usd ? String(r.amount_usd) : "");
  const [quoteNote, setQuoteNote] = useState("");
  const [date, setDate] = useState(r.follow_up_on ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Activity[] | null>(null);
  const terminal = r.stage === "won" || r.stage === "converted" || r.stage === "lost";
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const overdue = Boolean(r.follow_up_on && r.follow_up_on < today && !terminal);

  const loadTimeline = useCallback(async () => {
    const { data } = await getSupabaseBrowser().rpc("my_lead_activities", { p_kind: r.kind, p_item: r.item_id });
    setTimeline((data as Activity[] | null) ?? []);
  }, [r.kind, r.item_id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the timeline when the details open
    if (panel === "details") void loadTimeline();
  }, [panel, loadTimeline]);

  const log = async (type: "note" | "call" | "email", body: string) => {
    const { error } = await getSupabaseBrowser().rpc("add_lead_activity", { p_kind: r.kind, p_item: r.item_id, p_type: type, p_body: body });
    if (!error && panel === "details") void loadTimeline();
    return !error;
  };
  async function run(fn: () => Promise<boolean>, done: string) {
    setBusy(true);
    setMsg(null);
    const ok = await fn();
    setBusy(false);
    setMsg(ok ? done : "That did not save. Has supabase/schema-myleads.sql been run?");
    if (ok) onChanged();
    return ok;
  }

  const paid = receipt && (receipt.unlock_cents ?? 0) > 0;
  const price = receipt?.unlock_cents ? `$${(receipt.unlock_cents / 100).toFixed(2)}` : null;
  const toggle = (p: "follow" | "note" | "details" | "convert") => setPanel(panel === p ? null : p);

  /** The conversion happens in the database, which checks the lead is accepted and unlocked and never makes a second project. */
  async function convert() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await getSupabaseBrowser().rpc("convert_lead_to_project", {
      p_kind: r.kind, p_item: r.item_id, p_industry: item.industry, p_trade: item.trade, p_contract_value: Number(value), p_quote_note: quoteNote.trim() || null,
    });
    setBusy(false);
    if (error || typeof data !== "string") {
      setMsg(error?.message.includes("schema") || error?.code === "PGRST202" ? "Projects are not set up yet. Run supabase/schema-projects.sql." : (error?.message ?? "The project could not be created."));
      return;
    }
    onChanged();
    navigate(`/contractor/projects/${data}`);
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STAGE_STYLE[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
            {r.follow_up_on && !terminal && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${overdue ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                <BellRing className="size-3" aria-hidden /> Follow up {overdue ? "was due " : ""}{day(r.follow_up_on)}
              </span>
            )}
          </p>
          <h2 className="mt-1.5 text-base font-bold text-navy">{item.subject}</h2>
        </div>
        <label className="text-xs font-semibold text-slate-600">Status
          <select value={r.stage === "new" ? "saved" : r.stage} disabled={busy || r.stage === "converted"}
            onChange={(e) => void run(() => update({ stage: e.target.value as Stage }), "Status updated.")}
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-800">
            {r.stage === "converted" && <option value="converted">{STAGE_LABEL.converted}</option>}
            {stagesFor(r.kind).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Contact</p>
          <Row label="Name">{contact.name ?? "Not listed"}</Row>
          <Row label="Company">{contact.company ?? "Not listed"}</Row>
          <Row label="Phone">{contact.phone ? <a href={`tel:${contact.phone}`} className="font-semibold text-primary hover:underline">{contact.phone}</a> : "Not listed"}</Row>
          <Row label="Email">{contact.email ? <a href={`mailto:${contact.email}`} className="font-semibold text-primary hover:underline">{contact.email}</a> : "Not listed"}</Row>
          {contact.position && <Row label="Position">{contact.position}</Row>}
        </dl>
        <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Opportunity</p>
          {description && <p className="line-clamp-3 text-sm text-slate-800">{description}</p>}
          <Row label="Industry">{item.industry} · {item.trade}</Row>
          <Row label="Location"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-slate-400" aria-hidden /> {item.place || "Not listed"}</span></Row>
          <Row label="Est. value">{money(item.value)}{item.value === null && item.fact ? ` · ${item.fact}` : ""}</Row>
          <Row label="Source">{item.source}</Row>
          {item.when && <Row label="Discovered">{day(item.when)}</Row>}
        </dl>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Receipt className="size-3.5" aria-hidden /> Transaction</span>
        {receipt && <span>Unlocked {day(receipt.unlocked_at)}</span>}
        {price && <span>{price}</span>}
        <span className="inline-flex items-center gap-1 font-semibold text-green-800"><Check className="size-3.5" aria-hidden /> {paid ? "Paid" : plan === "premium" ? "Included in Premium" : receipt ? "Unlocked free" : "Unlocked"}</span>
        {receipt?.unlock_ref && <span title={receipt.unlock_ref}>Ref …{receipt.unlock_ref.slice(-10)}</span>}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} onClick={() => void log("call", "Called " + (contact.name ?? "the contact"))} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><Phone className="size-4" aria-hidden /> Call</a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} onClick={() => void log("email", "Opened an email to " + (contact.name ?? "the contact"))} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50"><Mail className="size-4" aria-hidden /> Email</a>
        )}
        <button type="button" onClick={() => toggle("follow")} aria-expanded={panel === "follow"} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50"><CalendarClock className="size-4" aria-hidden /> Schedule Follow-Up</button>
        <button type="button" onClick={() => toggle("note")} aria-expanded={panel === "note"} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50"><MessageSquarePlus className="size-4" aria-hidden /> Add Notes</button>
        <button type="button" onClick={() => toggle("details")} aria-expanded={panel === "details"} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50"><FileText className="size-4" aria-hidden /> View Full Details <ChevronDown className={`size-4 transition-transform ${panel === "details" ? "rotate-180" : ""}`} aria-hidden /></button>
        {r.stage === "won" && (
          <button type="button" onClick={() => toggle("convert")} aria-expanded={panel === "convert"} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><ArrowRightCircle className="size-4" aria-hidden /> Convert to Project</button>
        )}
        {r.stage === "converted" && projectId && (
          <Link to={`/contractor/projects/${projectId}`} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><ArrowRightCircle className="size-4" aria-hidden /> View Project</Link>
        )}
      </div>
      {r.stage !== "won" && r.stage !== "converted" && r.stage !== "lost" && (
        <p className="mt-2 text-xs text-slate-500">When the customer accepts your offer, set the status to <strong>Accepted</strong> to convert this lead into a project.</p>
      )}

      {panel === "convert" && (
        <form className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" onSubmit={(e) => { e.preventDefault(); void convert(); }}>
          <p className="text-sm font-semibold text-navy">Create a project from this accepted lead</p>
          <p className="mt-1 text-sm text-slate-700">These move across automatically, so you do not type them again: the customer&apos;s name, company, phone and email, the original opportunity, description and location, the industry and trade, your notes and the whole activity history. The lead stays here, marked Converted.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">Accepted contract value ($)
              <input type="number" min="1" step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} mt-1 !py-2`} />
            </label>
            <label className="min-w-52 flex-1 text-sm font-medium text-slate-700">What was accepted <span className="font-normal text-slate-500">(optional)</span>
              <input value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} maxLength={500} placeholder="Quote #, scope, payment terms…" className={`${inputClass} mt-1 !py-2`} />
            </label>
            <Button type="submit" disabled={busy || !value} className="!rounded-full !px-6 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Convert to Project</Button>
          </div>
        </form>
      )}

      {panel === "follow" && (
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (date) void run(() => update({ follow_up_on: date, ...(terminal ? {} : { stage: "follow_up" as Stage }) }), "Follow-up scheduled.").then((ok) => ok && setPanel(null)); }}>
          <label className="text-sm font-medium text-slate-700">Follow up on
            <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={`${inputClass} mt-1 !py-2`} />
          </label>
          <Button type="submit" disabled={busy || !date} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save follow-up</Button>
        </form>
      )}
      {panel === "note" && (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run(() => log("note", note.trim()), "Note added.").then((ok) => { if (ok) { setNote(""); setPanel(null); } }); }}>
          <label htmlFor={`note-${r.item_id}`} className="sr-only">Note</label>
          <textarea id={`note-${r.item_id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="What was said, what the customer needs, what to do next…" className={inputClass} />
          <Button type="submit" disabled={busy || !note.trim()} className="mt-2 !rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save note</Button>
        </form>
      )}
      <div role="status">{msg && <p className="mt-2 text-sm font-medium text-slate-700">{msg}</p>}</div>

      {panel === "details" && (
        <div className="mt-3 grid gap-4 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Activity timeline</p>
            {timeline === null ? <p className="mt-2 text-sm text-slate-500">Loading…</p> : timeline.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p> : (
              <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3 text-sm">
                {timeline.map((a, i) => (
                  <li key={i}>
                    <span className="font-semibold text-navy">{ACTIVITY_LABEL[a.type] ?? a.type}</span>
                    <span className="ml-2 text-xs text-slate-500">{ago(a.created_at)}</span>
                    {a.body && <p className="break-words whitespace-pre-line text-slate-700">{a.body}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="text-sm text-slate-700">
            <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Messages and the original record</p>
            <p className="mt-2">{r.kind === "lead" ? "Your conversation with this customer, in one place:" : "Open the full record, including documents and the original details:"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.kind === "lead" && <Link to={`/contractor/messages?lead=${r.item_id}`} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">Message customer</Link>}
              <Link to={`/contractor/leads?open=${r.kind}:${r.item_id}`} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">Open the full record</Link>
            </div>
            {r.note && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><strong>Earlier note:</strong> {r.note}</p>}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * My Leads: every lead the business has unlocked (paid for, or opened by its plan), with its contact details, where it came from,
 * what was paid and where it stands. Locked opportunities are not listed here; they stay in Discover Opportunities.
 */
export default function ContractorMyLeads() {
  const { listing } = useContractor();
  const hub = useLeadHub(listing);
  const { items, pipeline, plan, reloadAll } = hub;
  const [params] = useSearchParams();
  const [tab, setTab] = useState<TabId>("all");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [projectOf, setProjectOf] = useState<Map<string, string>>(new Map());

  const loadReceipts = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [r, c] = await Promise.all([sb.rpc("my_unlock_receipts"), sb.from("lead_conversions").select("kind, item_id, project_id")]);
    setReceipts((r.data as Receipt[] | null) ?? []);
    setProjectOf(new Map(((c.data as { kind: string; item_id: string; project_id: string }[] | null) ?? []).map((x) => [`${x.kind}:${x.item_id}`, x.project_id])));
  }, []);
  useEffect(() => {
    if (!listing) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadReceipts();
  }, [listing, loadReceipts]);

  // Back from Stripe after paying: confirm the payment, then load again.
  const sessionId = params.get("unlocked") === "1" ? params.get("session_id") : null;
  const [waiting, setWaiting] = useState(params.get("unlocked") === "1");
  useEffect(() => {
    if (params.get("unlocked") !== "1") return;
    if (sessionId) void callApi("/api/stripe/confirm", { sessionId }).then(() => { reloadAll(); void loadReceipts(); });
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      reloadAll();
      void loadReceipts();
      if (tries >= 5) {
        window.clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [params, sessionId, reloadAll, loadReceipts]);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const receiptOf = useMemo(() => new Map(receipts.map((x) => [`${x.kind}:${x.item_id}`, x])), [receipts]);
  const rows = useMemo(
    () => pipeline.flatMap((r) => {
      const item = byKey.get(`${r.kind}:${r.item_id}`);
      return item?.unlocked ? [{ r, item }] : [];
    }),
    [pipeline, byKey],
  );
  const lockedSaved = pipeline.filter((r) => { const i = byKey.get(`${r.kind}:${r.item_id}`); return i && !i.unlocked; }).length;
  const counts = useMemo(() => {
    const c: Record<TabId, number> = { all: rows.length, new: 0, contacted: 0, follow_up: 0, interested: 0, converted: 0, lost: 0 };
    for (const x of rows) c[tabOf(x.r.stage)]++;
    return c;
  }, [rows]);
  const shown = rows.filter((x) => tab === "all" || tabOf(x.r.stage) === tab);

  if (!listing) {
    return (
      <>
        <PageTitle title="My Leads" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  const detailsOf = (item: HubItem): { contact: Contact; description: string } => {
    if (item.kind === "lead") {
      const l = (hub.leads ?? []).find((x) => x.id === item.id);
      return { contact: { name: l ? [l.first_name, l.last_name].filter(Boolean).join(" ") : item.subject, company: null, position: null, phone: l?.phone ?? null, email: l?.email ?? null }, description: l?.description || item.blurb };
    }
    if (item.kind === "permit") {
      const p = hub.permits.find((x) => x.id === item.id);
      const person = p?.people?.find((x) => x.phone || x.email) ?? p?.people?.[0];
      return { contact: { name: person?.name ?? null, company: person?.company ?? p?.contractor_name ?? null, position: person?.role ?? null, phone: person?.phone ?? null, email: person?.email ?? null }, description: p?.description || item.blurb };
    }
    const b = hub.bids.find((x) => x.id === item.id);
    const c = b?.contacts?.find((x) => x.phone || x.email) ?? b?.contacts?.[0];
    return { contact: { name: c?.name ?? null, company: b?.agency ?? null, position: c?.title ?? null, phone: c?.phone ?? null, email: c?.email ?? null }, description: b?.summary || item.blurb };
  };

  return (
    <>
      <PageTitle title="My Leads" description="Every lead you have unlocked, with its contact details and where it stands. Locked opportunities stay in Discover Opportunities until you unlock them." />
      {waiting && params.get("unlocked") === "1" && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900"><Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking, this takes a few seconds…</p>
      )}

      <div role="tablist" aria-label="Lead status" className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label} <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${tab === t.id ? "bg-blue-100 text-primary" : "bg-slate-100 text-slate-600"}`}>{hub.loading ? "…" : counts[t.id]}</span>
          </button>
        ))}
      </div>

      {lockedSaved > 0 && (
        <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-800">
          {lockedSaved} saved {lockedSaved === 1 ? "opportunity is" : "opportunities are"} still locked. <Link to="/contractor/leads?show=saved" className="font-semibold text-primary underline">Review and unlock them</Link>
        </p>
      )}

      {hub.pipelineError ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">My Leads could not be loaded. Run <code>supabase/schema-revamp.sql</code> and <code>supabase/schema-myleads.sql</code> in the Supabase SQL Editor.</p>
      ) : hub.loading ? (
        <p className="text-slate-600">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-navy">{rows.length === 0 ? "No unlocked leads yet" : "Nothing in this tab"}</p>
          <p className="mt-2 text-sm text-slate-600">{rows.length === 0 ? "Unlock an opportunity in Discover Opportunities and it appears here with its contact details." : "Change a lead's status and it moves between tabs."}</p>
          {rows.length === 0 && <Link to="/contractor/leads" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Discover Opportunities <ArrowRight className="size-4" aria-hidden /></Link>}
        </div>
      ) : (
        <ul className="grid gap-4">
          {shown.map(({ r, item }) => {
            const d = detailsOf(item);
            return (
              <LeadCard key={`${r.kind}:${r.item_id}`} r={r} item={item} contact={d.contact} description={d.description} receipt={receiptOf.get(`${r.kind}:${r.item_id}`) ?? null} plan={plan} projectId={projectOf.get(`${r.kind}:${r.item_id}`) ?? null}
                onChanged={reloadAll} update={(patch) => hub.update(r, patch)} />
            );
          })}
        </ul>
      )}
    </>
  );
}
