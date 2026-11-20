import { useEffect, useMemo, useState } from "react";
import { LeadHistory } from "./LeadHistory";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, Columns3, LayoutGrid, List, Loader2, Lock, MapPin, MessageSquare, Phone, Search, Users, X } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { leadPrice } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import { CONTRACTOR_LEAD_STATUSES, type ContractorLead, type ContractorLeadStatus } from "@/lib/types";
import { callApi } from "./api";
import { EmailCustomer } from "./EmailCustomer";
import { UnlockButtons } from "./UnlockButtons";
import { useContractor } from "./context";
import { ago, useMyLeads } from "./useMyLeads";

type Tab = "all" | "locked" | ContractorLeadStatus;

const statusStyle: Record<ContractorLeadStatus, string> = {
  new: "border-blue-600 bg-blue-600 text-white",
  contacted: "border-amber-500 bg-amber-500 text-white",
  won: "border-green-600 bg-green-600 text-white",
  lost: "border-slate-500 bg-slate-500 text-white",
};

function Locked({ lead, price }: { lead: ContractorLead; price: number }) {
  return (
    <>
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold text-navy">Area</dt><dd className="text-slate-700">{[lead.city, lead.state, lead.postal_code].filter(Boolean).join(", ") || "Not given"}</dd></div>
      <div><dt className="font-semibold text-navy">Property</dt><dd className="text-slate-700">{[lead.property_type, lead.property_status].filter(Boolean).join(" · ") || "Not given"}</dd></div>
      <div><dt className="font-semibold text-navy">Prefers</dt><dd className="text-slate-700">{lead.contact_method}{lead.preferred_contact_time ? ` · ${lead.preferred_contact_time}` : ""}</dd></div>
      <div><dt className="font-semibold text-navy">Phone, email and street address</dt><dd><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"><Lock className="size-3" aria-hidden /> Locked</span></dd></div>
      {lead.description && <div className="sm:col-span-2"><dt className="font-semibold text-navy">What they said</dt><dd className="whitespace-pre-line text-slate-700">{lead.description}</dd></div>}
    </dl>
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy"><Lock className="size-4 text-slate-500" aria-hidden /> Phone, email and street address are locked</p>
      <p className="mt-1 text-sm text-slate-600">Unlock to call or email the customer and see their exact address.</p>
      <div className="mt-3">
        <UnlockButtons endpoint="/api/stripe/unlock" body={{ leadId: lead.id }} price={price} returnTo={`/contractor/leads?unlocked=1&open=lead:${lead.id}&lead=${lead.id}`} />
        <p className="mt-2 text-xs text-slate-500">One payment for this request. Not refundable.</p>
      </div>
    </div>
    </>
  );
}

function Details({ lead, onSaved }: { lead: ContractorLead; onSaved: (l: ContractorLead) => void }) {
  const [notes, setNotes] = useState(lead.contractor_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { listing } = useContractor();
  const tel = `tel:${(lead.phone ?? "").replace(/[^\d+]/g, "")}`;

  async function save(status: ContractorLeadStatus, noteText: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().rpc("update_my_lead", { p_id: lead.id, p_status: status, p_notes: noteText });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "Could not save. Please try again." });
    onSaved({ ...lead, contractor_status: status, contractor_notes: noteText.trim() || null, contacted_at: status === "new" ? null : lead.contacted_at ?? new Date().toISOString() });
    setMsg({ ok: true, text: "Saved." });
  }

  return (
    <>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-navy">Service address</dt><dd className="text-slate-700">{[lead.street, lead.unit, `${lead.city}, ${lead.state} ${lead.postal_code}`].filter(Boolean).join(", ")}</dd></div>
        <div><dt className="font-semibold text-navy">Property</dt><dd className="text-slate-700">{lead.property_type} · {lead.property_status}</dd></div>
        <div><dt className="font-semibold text-navy">Prefers</dt><dd className="text-slate-700">{lead.contact_method}{lead.preferred_contact_time ? ` · ${lead.preferred_contact_time}` : ""}</dd></div>
        {lead.description && <div className="sm:col-span-2"><dt className="font-semibold text-navy">What they said</dt><dd className="whitespace-pre-line text-slate-700">{lead.description}</dd></div>}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={tel} className={buttonClass("primary", "!rounded-full !px-4 !py-2 text-sm")}><Phone className="size-4" aria-hidden /> Call {lead.phone}</a>
        {lead.email && listing && <EmailCustomer leadId={lead.id} listingId={listing.id} businessName={listing.business_name} customerName={lead.first_name} issue={lead.issue} email={lead.email} />}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-navy" id={`st-${lead.id}`}>Status</p>
        <div role="group" aria-labelledby={`st-${lead.id}`} className="mt-2 flex flex-wrap gap-1.5">
          {CONTRACTOR_LEAD_STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={lead.contractor_status === s} disabled={busy} onClick={() => lead.contractor_status !== s && save(s, notes)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize transition-colors disabled:opacity-60 ${lead.contractor_status === s ? statusStyle[s] : "border-slate-300 bg-white text-navy hover:bg-slate-50"}`}>
              {s}
            </button>
          ))}
        </div>
        {lead.contacted_at && lead.contractor_status !== "new" && <p className="mt-2 text-xs text-slate-500">First marked contacted {ago(lead.contacted_at)}.</p>}

        <label htmlFor={`nt-${lead.id}`} className="mt-4 mb-1.5 block text-sm font-semibold text-navy">Your notes <span className="font-normal text-slate-500">(only you can see these)</span></label>
        <textarea id={`nt-${lead.id}`} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who you spoke to, quote given, next step…" className={inputClass} />
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" onClick={() => save(lead.contractor_status, notes)} disabled={busy || notes === (lead.contractor_notes ?? "")} className="!rounded-full !px-5 !py-2 text-sm">Save notes</Button>
          <span role="status" className={`text-sm ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</span>
        </div>
      </div>
    </>
  );
}

function LeadCard({ lead, price, onSaved }: { lead: ContractorLead; price: number; onSaved: (l: ContractorLead) => void }) {
  const urgent = lead.urgency === "Immediately";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-navy">{lead.first_name} {lead.last_name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> Received {ago(lead.assigned_at)}</span>
            {lead.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {lead.city}, {lead.state}</span>}
            {lead.recipient_count > 1 && <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden /> Also sent to {lead.recipient_count - 1} other {lead.recipient_count === 2 ? "contractor" : "contractors"}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {urgent && <span className="rounded-full bg-emergency-soft px-2.5 py-0.5 text-xs font-semibold text-emergency">Needs help now</span>}
          {lead.urgency && lead.urgency !== "Immediately" && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{lead.urgency}</span>}
          {lead.unlocked ? <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">Unlocked</span> : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"><Lock className="size-3" aria-hidden /> Locked</span>}
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
        <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Concern</p>
        <p className="text-sm text-slate-800">{lead.issue}</p>
      </div>
      {lead.unlocked ? <Details lead={lead} onSaved={onSaved} /> : <Locked lead={lead} price={price} />}
      <div className="mt-3 border-t border-slate-100 pt-3">
        {lead.unlocked ? (
          <Link to={`/contractor/messages?lead=${lead.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><MessageSquare className="size-4" aria-hidden /> Message customer</Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Lock className="size-4" aria-hidden /> Messaging is locked until you unlock this request</span>
        )}
      </div>
      <LeadHistory leadId={lead.id} />
    </div>
  );
}

type View = "cards" | "list" | "board";
const VIEWS: { id: View; label: string; icon: typeof List }[] = [
  { id: "cards", label: "Cards", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "board", label: "Columns", icon: Columns3 },
];
type Sort = "newest" | "oldest" | "urgent";
const PAGE = 60;
const dot: Record<ContractorLeadStatus, string> = { new: "bg-blue-600", contacted: "bg-amber-500", won: "bg-green-600", lost: "bg-slate-400" };

/** Urgent, locked or unlocked: the small tags shared by every view. */
function Tags({ lead }: { lead: ContractorLead }) {
  return (
    <>
      {lead.urgency === "Immediately" && <span className="rounded-full bg-emergency-soft px-2 py-0.5 text-xs font-semibold text-emergency">Needs help now</span>}
      {lead.unlocked
        ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800">Unlocked</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"><Lock className="size-3" aria-hidden /> Locked</span>}
    </>
  );
}

/** A small card: enough to tell requests apart. Click it for everything. */
function LeadTile({ lead, onOpen }: { lead: ContractorLead; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className={`block w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow focus-visible:outline-2 focus-visible:outline-primary ${lead.contractor_status === "new" ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-bold text-navy">{lead.first_name} {lead.last_name}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 capitalize"><span className={`size-2 rounded-full ${dot[lead.contractor_status]}`} aria-hidden />{lead.contractor_status}</span>
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {ago(lead.assigned_at)}</span>
        {lead.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {lead.city}</span>}
      </span>
      <span className="mt-2 block border-t border-slate-100 pt-2">
        <span className="block text-[11px] font-bold tracking-wide text-slate-500 uppercase">Concern</span>
        <span className="line-clamp-2 block text-sm text-slate-700">{lead.issue}</span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5"><Tags lead={lead} /></span>
    </button>
  );
}

/** One line per request, for working through a long list quickly. */
function LeadRow({ lead, onOpen }: { lead: ContractorLead; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary">
        <span className={`size-2.5 shrink-0 rounded-full ${dot[lead.contractor_status]}`} aria-label={lead.contractor_status} />
        <span className="w-40 shrink-0 truncate text-sm font-semibold text-navy">{lead.first_name} {lead.last_name}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{lead.issue}</span>
        <span className="hidden w-32 shrink-0 truncate text-sm text-slate-500 md:block">{lead.city ?? ""}</span>
        <span className="hidden w-24 shrink-0 text-xs text-slate-500 sm:block">{ago(lead.assigned_at)}</span>
        <span className="hidden shrink-0 items-center gap-1.5 lg:flex"><Tags lead={lead} /></span>
        <span className="shrink-0 lg:hidden">{lead.unlocked ? null : <Lock className="size-4 text-slate-400" aria-label="Locked" />}</span>
      </button>
    </li>
  );
}

/** The whole request in a panel that slides over the page. Escape or a click outside closes it. */
export function LeadPanel({ lead, price, onSaved, onClose }: { lead: ContractorLead; price: number; onSaved: (l: ContractorLead) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Customer request" onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Customer request</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" aria-hidden /></button>
        </div>
        <LeadCard lead={lead} price={price} onSaved={onSaved} />
      </aside>
    </div>
  );
}

export default function ContractorLeads() {
  const { listing } = useContractor();
  const { leads, error, replace, reload } = useMyLeads(Boolean(listing));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [view, setViewState] = useState<View>(() => {
    try {
      const saved = localStorage.getItem("lead-view");
      return saved === "list" || saved === "board" ? saved : "cards";
    } catch {
      return "cards";
    }
  });
  const [sort, setSort] = useState<Sort>("newest");
  const [visible, setVisible] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const setView = (v: View) => {
    setViewState(v);
    setVisible(PAGE);
    try {
      localStorage.setItem("lead-view", v);
    } catch {
      /* the choice just is not remembered */
    }
  };
  const justPaid = params.get("unlocked") === "1";
  const [waiting, setWaiting] = useState(justPaid);
  const tabParam = params.get("status");
  const tab: Tab = tabParam === "locked" || CONTRACTOR_LEAD_STATUSES.includes(tabParam as ContractorLeadStatus) ? (tabParam as Tab) : "all";
  const paid = listing ? activePlan(listing) !== "free" : false;
  const price = paid ? leadPrice.paid : leadPrice.free;

  // Coming back from Stripe: ask the server to check the payment with Stripe and unlock the request right away. The webhook does the
  // same a moment later, so check a few more times in case it is the one that finishes.
  const sessionId = params.get("session_id");
  useEffect(() => {
    if (!justPaid) return;
    if (sessionId) void callApi("/api/stripe/confirm", { sessionId }).then(() => reload());
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      void reload();
      if (tries >= 10) {
        window.clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [justPaid, sessionId, reload]);

  // Stop saying "unlocking" as soon as the request that was just paid for has unlocked.
  const paidLead = params.get("lead");
  const paidLeadOpen = Boolean(paidLead && leads?.some((l) => l.id === paidLead && l.unlocked));
  const stillWaiting = waiting && justPaid && !paidLeadOpen;

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: leads?.length ?? 0, locked: 0, new: 0, contacted: 0, won: 0, lost: 0 };
    for (const l of leads ?? []) {
      c[l.contractor_status]++;
      if (!l.unlocked) c.locked++;
    }
    return c;
  }, [leads]);

  const term = q.trim().toLowerCase();
  const shown = (leads ?? [])
    .filter(
      (l) =>
        (tab === "all" || (tab === "locked" ? !l.unlocked : l.contractor_status === tab)) &&
        (!term || [l.first_name, l.last_name, l.issue, l.city ?? "", l.unlocked ? [l.phone, l.email].join(" ") : ""].join(" ").toLowerCase().includes(term)),
    )
    .sort((a, b) =>
      sort === "oldest" ? a.assigned_at.localeCompare(b.assigned_at)
        : sort === "urgent" ? Number(b.urgency === "Immediately") - Number(a.urgency === "Immediately") || b.assigned_at.localeCompare(a.assigned_at)
          : b.assigned_at.localeCompare(a.assigned_at));
  const open = openId ? (leads ?? []).find((l) => l.id === openId) ?? null : null;

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.delete("unlocked");
    if (t === "all") next.delete("status");
    else next.set("status", t);
    setParams(next, { replace: true });
  };

  if (!listing) {
    return (
      <>
        <PageTitle title="Customer requests" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  const tabs: Tab[] = ["all", "locked", ...CONTRACTOR_LEAD_STATUSES];

  return (
    <>
      <PageTitle title="Customer requests" />
      <p className="mb-5 text-sm text-slate-700">
        New requests from customers near you are sent to you automatically. You see everything except the customer&apos;s phone number, email and street address. Unlock a request for <strong>${price}</strong> to see them{!paid && <>, or <Link to="/contractor/billing" className="font-semibold text-primary underline">go Featured</Link> and pay ${leadPrice.paid} instead</>}.
      </p>

      {stillWaiting && (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking your request, this takes a few seconds…
        </p>
      )}

      {justPaid && !waiting && !paidLeadOpen && (
        <p role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your payment went through but the request has not unlocked yet. Refresh this page in a minute. If it is still locked, contact us with the time of your payment and we will unlock it.
        </p>
      )}

      {error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Requests couldn&apos;t be loaded. Make sure the latest <code>schema-contractors.sql</code> has been run.</p>
      ) : leads === null ? (
        <p className="text-slate-600">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Filter requests" className="flex flex-wrap gap-1.5">
              {tabs.map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold capitalize ${tab === t ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy hover:bg-slate-50"}`}>
                  {t} ({counts[t]})
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="lead-sort">Sort requests</label>
              <select id="lead-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputClass} !w-auto !py-2.5`}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="urgent">Needs help now first</option>
              </select>
              <div role="group" aria-label="Layout" className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
                {VIEWS.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} title={label}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${view === id ? "bg-primary text-white" : "text-navy hover:bg-slate-50"}`}>
                    <Icon className="size-4" aria-hidden /> <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
              <label htmlFor="lead-q" className="sr-only">Search requests</label>
              <input id="lead-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or problem…" className={`${inputClass} !py-2.5 !pl-9`} />
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-lg font-semibold text-navy">No requests yet</p>
              <p className="mt-2 text-sm text-slate-600">When a customer asks for help near you, the request appears here. Make sure your listing is published and your ZIP code and travel distance are set in My business.</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="mt-6 text-sm text-slate-600">No requests match your filters.</p>
          ) : (
            <>
              <p className="mt-4 text-xs text-slate-500">{shown.length} {shown.length === 1 ? "request" : "requests"}. Click one to see everything and update its status.</p>
              {view === "cards" && (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {shown.slice(0, visible).map((l) => <li key={l.id}><LeadTile lead={l} onOpen={() => setOpenId(l.id)} /></li>)}
                </ul>
              )}
              {view === "list" && (
                <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {shown.slice(0, visible).map((l) => <LeadRow key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />)}
                </ul>
              )}
              {view === "board" && (
                <div className="mt-3 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {CONTRACTOR_LEAD_STATUSES.map((st) => {
                    const col = shown.filter((l) => l.contractor_status === st);
                    return (
                      <section key={st} aria-label={st} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-navy capitalize"><span className={`size-2.5 rounded-full ${dot[st]}`} aria-hidden />{st} <span className="font-semibold text-slate-500">({col.length})</span></h2>
                        {col.length === 0 ? <p className="px-1 py-2 text-sm text-slate-500">None.</p> : (
                          <ul className="grid max-h-[70vh] gap-2.5 overflow-y-auto pr-1">
                            {col.slice(0, visible).map((l) => <li key={l.id}><LeadTile lead={l} onOpen={() => setOpenId(l.id)} /></li>)}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
              {shown.length > visible && (
                <div className="mt-4 text-center">
                  <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)} className="!rounded-full text-sm">Show {Math.min(PAGE, shown.length - visible)} more</Button>
                </div>
              )}
            </>
          )}
          {open && <LeadPanel lead={open} price={price} onSaved={replace} onClose={() => setOpenId(null)} />}
        </>
      )}

      <p className="mt-8 text-xs text-slate-500">
        A request can be sent to up to three contractors, and we can&apos;t guarantee any number of requests or jobs. Customer details are shared so you can respond to their request:
        use them only for that, and follow the rules that apply to calls, texts and emails. Unlocked requests are not refundable.
      </p>
    </>
  );
}
