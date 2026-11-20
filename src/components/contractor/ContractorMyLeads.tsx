import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowRightCircle, BellRing, CalendarCheck, CalendarClock, Check, FileText, Loader2, MapPin, MessageSquarePlus, Phone, Receipt as ReceiptIcon, Search } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";
import { BookingCalendar } from "./BookingCalendar";
import { useContractor } from "./context";
import { EmailCustomer } from "./EmailCustomer";
import { EmailOpportunity } from "./EmailOpportunity";
import { LeadRecordModal } from "./LeadRecordModal";
import { day, initials, money, stepsFor, type Contact, type Receipt } from "./leadRecord";
import { KIND_LABEL, KIND_STYLE, STAGE_LABEL, STAGE_STYLE, stagesFor, type HubItem, type LeadKind, type PipelineRow, type Stage, useLeadHub } from "./useLeadHub";

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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex gap-2 text-sm"><dt className="w-20 shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 flex-1 break-words text-slate-800">{children}</dd></div>;
}
const pill = "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50";
const BORDER: Record<LeadKind, string> = { lead: "border-l-sky-500", permit: "border-l-amber-500", bid: "border-l-violet-500" };

/** The progress bar on a lead: where it is now, with the steps already passed filled in. */
function Progress({ r }: { r: PipelineRow }) {
  const steps = stepsFor(r.kind);
  const at = r.stage === "lost" ? -1 : steps.findIndex((s) => s.stages.includes(r.stage));
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={i === at ? "step" : undefined}>
          <span className={`h-1.5 rounded-full ${r.stage === "lost" ? "bg-slate-200" : i < at ? "bg-primary" : i === at ? "bg-primary/70" : "bg-slate-200"}`} />
          <span className={`truncate text-[11px] ${i === at ? "font-bold text-primary" : "text-slate-500"}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function LeadCard({ r, item, contact, description, receipt, plan, projectId, onChanged, update, autoOpen }: {
  r: PipelineRow; item: HubItem; contact: Contact; description: string; receipt: Receipt | null; plan: string; projectId: string | null;
  onChanged: () => void; update: (patch: Partial<Pick<PipelineRow, "stage" | "follow_up_on">>) => Promise<boolean>; autoOpen: boolean;
}) {
  const navigate = useNavigate();
  const { listing } = useContractor();
  const [panel, setPanel] = useState<null | "follow" | "note" | "accepted">(autoOpen && r.stage === "won" ? "accepted" : null);
  const [record, setRecord] = useState(false);
  const [value, setValue] = useState(r.amount_usd ? String(r.amount_usd) : "");
  const [quoteNote, setQuoteNote] = useState("");
  const [date, setDate] = useState(r.follow_up_on ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const terminal = r.stage === "won" || r.stage === "converted" || r.stage === "lost";
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const overdue = Boolean(r.follow_up_on && r.follow_up_on <= today && !terminal);

  const sb = getSupabaseBrowser();
  const addNote = async (type: "note" | "email", body: string) => {
    const { error } = await sb.rpc("add_lead_activity", { p_kind: r.kind, p_item: r.item_id, p_type: type, p_body: body });
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

  /** The system cannot hear a phone call, so after dialling it asks how it went. A call that connected moves the lead to Contacted. */
  async function callOutcome(outcome: "connected" | "no_answer" | "voicemail") {
    setBusy(true);
    const { data, error } = await sb.rpc("log_call", { p_kind: r.kind, p_item: r.item_id, p_outcome: outcome, p_note: null });
    setBusy(false);
    setAsked(false);
    if (error) return setMsg(error.message.includes("function") ? "Run supabase/schema-bookings.sql first." : error.message);
    setMsg(data === true ? "Call saved. The status moved to Contacted." : "Call saved on the timeline.");
    onChanged();
  }

  async function changeStage(stage: Stage) {
    const ok = await run(() => update({ stage }), "Status updated. We emailed you the change.");
    if (ok && stage === "won") setPanel("accepted");
  }

  const paid = receipt && (receipt.unlock_cents ?? 0) > 0;
  const price = receipt?.unlock_cents ? `$${(receipt.unlock_cents / 100).toFixed(2)}` : null;
  const toggle = (p: "follow" | "note" | "accepted") => setPanel(panel === p ? null : p);

  /** The conversion happens in the database, which checks the lead is accepted and unlocked and never makes a second project. */
  async function convert() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await sb.rpc("convert_lead_to_project", {
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

  const emailed = (s: string) => { void addNote("email", `Emailed ${contact.name ?? "the contact"}: ${s}`); onChanged(); };

  return (
    <li className={`rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${BORDER[r.kind]}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-navy/10 text-sm font-bold text-navy" aria-hidden>{initials(contact.name ?? item.subject)}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STAGE_STYLE[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
            {r.follow_up_on && !terminal && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${overdue ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                <BellRing className="size-3" aria-hidden /> Follow up {r.follow_up_on < today ? "was due " : ""}{day(r.follow_up_on)}
              </span>
            )}
          </p>
          <h2 className="mt-1 text-base font-bold text-navy">{item.subject}</h2>
          <p className="flex items-center gap-1 text-sm text-slate-600"><MapPin className="size-3.5 text-slate-400" aria-hidden /> {item.place || "Location not listed"}{item.value !== null && <span className="ml-2 font-semibold text-slate-800">{money(item.value)}</span>}</p>
        </div>
        <label className="text-xs font-semibold text-slate-600">Status
          <select value={r.stage === "new" ? "saved" : r.stage} disabled={busy || r.stage === "converted"} onChange={(e) => void changeStage(e.target.value as Stage)}
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-800">
            {r.stage === "converted" && <option value="converted">{STAGE_LABEL.converted}</option>}
            {stagesFor(r.kind).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>

      <Progress r={r} />

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <dl className="space-y-1.5 rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Contact</p>
          <Row label="Name">{contact.name ?? "Not listed"}{contact.company ? ` · ${contact.company}` : ""}</Row>
          <Row label="Phone">{contact.phone ? <a href={`tel:${contact.phone}`} className="font-semibold text-primary hover:underline">{contact.phone}</a> : "Not listed"}</Row>
          <Row label="Email"><span className="break-all">{contact.email ?? "Not listed"}</span></Row>
        </dl>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Opportunity</p>
          {description && <p className="mt-1 line-clamp-2 text-sm text-slate-800">{description}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>{item.industry} · {item.trade}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><ReceiptIcon className="size-3.5" aria-hidden /> {receipt ? `Unlocked ${day(receipt.unlocked_at)}` : "Unlocked"}{price ? ` · ${price}` : ""}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-green-800"><Check className="size-3.5" aria-hidden /> {paid ? "Paid" : plan === "premium" ? "Included in Premium" : "Unlocked"}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} onClick={() => setAsked(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><Phone className="size-4" aria-hidden /> Call</a>
        )}
        {contact.email && listing && (r.kind === "lead"
          ? <EmailCustomer leadId={r.item_id} listingId={listing.id} businessName={listing.business_name} customerName={(contact.name ?? "").split(" ")[0] || "there"} issue={contact.issue ?? ""} email={contact.email} label="Email" onSent={emailed} />
          : <EmailOpportunity kind={r.kind as "permit" | "bid"} itemId={r.item_id} index={contact.index} email={contact.email} recipient={contact.name ?? contact.company ?? contact.email} businessName={listing.business_name} label="Email"
              defaultSubject={r.kind === "bid" ? `Interest in ${item.subject}` : `HVAC help on ${item.subject}`} project={item.subject} onSent={emailed} />)}
        <button type="button" onClick={() => toggle("follow")} aria-expanded={panel === "follow"} className={pill}><CalendarClock className="size-4" aria-hidden /> Follow-Up</button>
        <button type="button" onClick={() => toggle("note")} aria-expanded={panel === "note"} className={pill}><MessageSquarePlus className="size-4" aria-hidden /> Add Note</button>
        <button type="button" onClick={() => setRecord(true)} className={pill}><FileText className="size-4" aria-hidden /> Full Record</button>
        {r.stage === "won" && (
          <button type="button" onClick={() => toggle("accepted")} aria-expanded={panel === "accepted"} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><CalendarCheck className="size-4" aria-hidden /> Book &amp; Convert</button>
        )}
        {r.stage === "converted" && projectId && (
          <Link to={`/contractor/projects/${projectId}`} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"><ArrowRightCircle className="size-4" aria-hidden /> View Project</Link>
        )}
      </div>

      {asked && (
        <div role="group" aria-label="How did the call go?" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <span className="font-semibold text-navy">How did the call go?</span>
          <button type="button" disabled={busy} onClick={() => void callOutcome("connected")} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white">Spoke with them</button>
          <button type="button" disabled={busy} onClick={() => void callOutcome("voicemail")} className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy">Left a voicemail</button>
          <button type="button" disabled={busy} onClick={() => void callOutcome("no_answer")} className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy">No answer</button>
          <button type="button" onClick={() => setAsked(false)} className="ml-auto text-xs text-slate-500 hover:underline">Skip</button>
        </div>
      )}
      {r.stage !== "won" && r.stage !== "converted" && r.stage !== "lost" && (
        <p className="mt-2 text-xs text-slate-500">Status moves on its own when you have a call that connects, send an email or a proposal, or they ask for a quote. When they accept, set it to <strong>Accepted</strong> to book the job and make a project.</p>
      )}

      {panel === "accepted" && listing && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-base font-bold text-navy">Accepted: book the job, then make it a project</p>
          <p className="mt-0.5 text-sm text-slate-700">Pick a day to book the visit or the work. Bookings follow this lead into its project.</p>
          <div className="mt-3">
            <BookingCalendar listingId={listing.id} link={{ kind: r.kind, itemId: r.item_id }} projectId={projectId ?? undefined} defaults={{ title: item.subject, customer: contact.name, location: item.place }} />
          </div>
          {r.stage === "won" && (
            <form className="mt-4 rounded-xl border border-emerald-200 bg-white p-4" onSubmit={(e) => { e.preventDefault(); void convert(); }}>
              <p className="text-sm font-semibold text-navy">Create a project from this accepted lead</p>
              <p className="mt-1 text-sm text-slate-700">Name, company, phone, email, the opportunity, your notes, the history and these bookings come across by themselves. The lead stays here, marked Converted.</p>
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
        </div>
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
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run(() => addNote("note", note.trim()), "Note added.").then((ok) => { if (ok) { setNote(""); setPanel(null); } }); }}>
          <label htmlFor={`note-${r.item_id}`} className="sr-only">Note</label>
          <textarea id={`note-${r.item_id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="What was said, what the customer needs, what to do next…" className={inputClass} />
          <Button type="submit" disabled={busy || !note.trim()} className="mt-2 !rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save note</Button>
        </form>
      )}
      <div role="status">{msg && <p className="mt-2 text-sm font-medium text-slate-700">{msg}</p>}</div>

      {record && listing && (
        <LeadRecordModal r={r} item={item} contact={contact} description={description} receipt={receipt} plan={plan} listingId={listing.id} onClose={() => setRecord(false)} onChanged={onChanged} />
      )}
    </li>
  );
}

const Tile = ({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone: string }) => (
  <div className={`rounded-2xl border p-3.5 ${tone}`}>
    <p className="text-xs font-semibold text-slate-600">{label}</p>
    <p className="mt-0.5 text-2xl font-extrabold text-navy">{value}</p>
    <p className="text-xs text-slate-600">{hint}</p>
  </div>
);

/**
 * My Leads: every lead the business has unlocked (paid for, or opened by its plan), with its contact details, where it came from,
 * what was paid and where it stands. Locked opportunities are not listed here; they stay in Discover Opportunities.
 * The status moves on its own (calls, emails, proposals, replies asking for a quote); see supabase/schema-bookings.sql.
 */
export default function ContractorMyLeads() {
  const { listing } = useContractor();
  const hub = useLeadHub(listing);
  const { items, pipeline, plan, reloadAll } = hub;
  const [params] = useSearchParams();
  const [tab, setTab] = useState<TabId>("all");
  const [kindFilter, setKindFilter] = useState<"all" | LeadKind>("all");
  const [search, setSearch] = useState("");
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

  // The system moves leads by itself (a customer replies, an email goes out), so look again every minute and when the tab comes back.
  useEffect(() => {
    if (!listing) return;
    const again = () => { if (document.visibilityState === "visible") reloadAll(); };
    const timer = window.setInterval(again, 60_000);
    document.addEventListener("visibilitychange", again);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", again); };
  }, [listing, reloadAll]);

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
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const counts = useMemo(() => {
    const c: Record<TabId, number> = { all: rows.length, new: 0, contacted: 0, follow_up: 0, interested: 0, converted: 0, lost: 0 };
    for (const x of rows) c[tabOf(x.r.stage)]++;
    return c;
  }, [rows]);
  const stats = useMemo(() => ({
    fresh: rows.filter((x) => tabOf(x.r.stage) === "new").length,
    due: rows.filter((x) => x.r.follow_up_on && x.r.follow_up_on <= today && !["won", "converted", "lost"].includes(x.r.stage)).length,
    active: rows.filter((x) => ["contacted", "follow_up", "interested", "quoted", "submitted"].includes(x.r.stage)).length,
    accepted: rows.filter((x) => x.r.stage === "won").length,
  }), [rows, today]);
  const q = search.trim().toLowerCase();
  const shown = rows.filter((x) => (tab === "all" || tabOf(x.r.stage) === tab) && (kindFilter === "all" || x.r.kind === kindFilter) && (!q || `${x.item.subject} ${x.item.place} ${x.item.blurb}`.toLowerCase().includes(q)));

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
      return { contact: { name: l ? [l.first_name, l.last_name].filter(Boolean).join(" ") : item.subject, company: null, position: null, phone: l?.phone ?? null, email: l?.email ?? null, index: 0, issue: l?.issue }, description: l?.description || item.blurb };
    }
    // The server is told which contact by position (never the address), so remember where the chosen one sits in the list.
    const pick = <T extends { phone?: string | null; email?: string | null }>(list: T[] | null | undefined) => {
      const i = Math.max(0, (list ?? []).findIndex((x) => x.phone || x.email));
      return { person: (list ?? [])[i], index: i };
    };
    if (item.kind === "permit") {
      const p = hub.permits.find((x) => x.id === item.id);
      const { person, index } = pick(p?.people);
      return { contact: { name: person?.name ?? null, company: person?.company ?? p?.contractor_name ?? null, position: person?.role ?? null, phone: person?.phone ?? null, email: person?.email ?? null, index }, description: p?.description || item.blurb };
    }
    const b = hub.bids.find((x) => x.id === item.id);
    const { person: c, index } = pick(b?.contacts);
    return { contact: { name: c?.name ?? null, company: b?.agency ?? null, position: c?.title ?? null, phone: c?.phone ?? null, email: c?.email ?? null, index }, description: b?.summary || item.blurb };
  };

  return (
    <>
      <PageTitle title="My Leads" description="Every lead you have unlocked, with its contact details and where it stands. The status moves on its own as you call, email and quote, and we email you each change." />
      {waiting && params.get("unlocked") === "1" && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900"><Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking, this takes a few seconds…</p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="New" value={hub.loading ? "…" : stats.fresh} hint="Not contacted yet" tone="border-sky-200 bg-sky-50/60" />
        <Tile label="Follow-ups due" value={hub.loading ? "…" : stats.due} hint="Today or overdue" tone={stats.due ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"} />
        <Tile label="In progress" value={hub.loading ? "…" : stats.active} hint="Contacted to quoted" tone="border-amber-200 bg-amber-50/60" />
        <Tile label="Accepted" value={hub.loading ? "…" : stats.accepted} hint="Ready to book and convert" tone="border-emerald-200 bg-emerald-50/60" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Lead status" className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
              {t.label} <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${tab === t.id ? "bg-blue-100 text-primary" : "bg-slate-100 text-slate-600"}`}>{hub.loading ? "…" : counts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="relative">
          <span className="sr-only">Search your leads</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads" className="w-44 rounded-full border border-slate-300 bg-white py-1.5 pr-3 pl-9 text-sm" />
        </label>
        <label className="text-sm">
          <span className="sr-only">Type of lead</span>
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm">
            <option value="all">All types</option>
            <option value="lead">Customer requests</option>
            <option value="permit">Building permits</option>
            <option value="bid">Government contracts</option>
          </select>
        </label>
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
          <p className="text-lg font-semibold text-navy">{rows.length === 0 ? "No unlocked leads yet" : "Nothing matches"}</p>
          <p className="mt-2 text-sm text-slate-600">{rows.length === 0 ? "Unlock an opportunity in Discover Opportunities and it appears here with its contact details." : "Try another tab, type or search."}</p>
          {rows.length === 0 && <Link to="/contractor/leads" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Discover Opportunities <ArrowRight className="size-4" aria-hidden /></Link>}
        </div>
      ) : (
        <ul className="grid gap-4">
          {shown.map(({ r, item }) => {
            const d = detailsOf(item);
            return (
              <LeadCard key={`${r.kind}:${r.item_id}`} r={r} item={item} contact={d.contact} description={d.description} receipt={receiptOf.get(`${r.kind}:${r.item_id}`) ?? null} plan={plan} projectId={projectOf.get(`${r.kind}:${r.item_id}`) ?? null}
                autoOpen={false} onChanged={reloadAll} update={(patch) => hub.update(r, patch)} />
            );
          })}
        </ul>
      )}
    </>
  );
}
