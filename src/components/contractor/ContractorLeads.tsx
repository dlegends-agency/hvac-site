import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, Loader2, Lock, Mail, MapPin, Phone, Search, Users } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { leadPrice } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import { CONTRACTOR_LEAD_STATUSES, type ContractorLead, type ContractorLeadStatus } from "@/lib/types";
import { callApi } from "./api";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    const res = await callApi<{ url?: string }>("/api/stripe/unlock", { leadId: lead.id });
    if (res.data.url) return void window.location.assign(res.data.url);
    setBusy(false);
    setError(
      res.status === 501 ? "Online payments aren't switched on yet. Please contact us."
        : res.status === 409 ? "This request is already unlocked. Refresh the page."
          : "We couldn't start the payment. Please try again.",
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy"><Lock className="size-4 text-slate-500" aria-hidden /> The rest of this request is locked</p>
      <p className="mt-1 text-sm text-slate-600">Unlock it to see the customer&apos;s phone number, email, address, when they need help and their full message.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={unlock} disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Unlock for ${price}
        </Button>
        <span className="text-xs text-slate-500">One payment for this request. Not refundable.</span>
      </div>
      <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}</div>
    </div>
  );
}

function Details({ lead, onSaved }: { lead: ContractorLead; onSaved: (l: ContractorLead) => void }) {
  const [notes, setNotes] = useState(lead.contractor_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
        <a href={`mailto:${lead.email}`} className={buttonClass("secondary", "!rounded-full !px-4 !py-2 text-sm")}><Mail className="size-4" aria-hidden /> {lead.email}</a>
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
    <li className={`rounded-2xl border bg-white p-5 shadow-sm ${lead.contractor_status === "new" ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-navy">{lead.first_name} {lead.last_name}</p>
          <p className="mt-0.5 text-sm text-slate-700">{lead.issue}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> Received {ago(lead.assigned_at)}</span>
            {lead.unlocked && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {lead.city}, {lead.state}</span>}
            {lead.recipient_count > 1 && <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden /> Also sent to {lead.recipient_count - 1} other {lead.recipient_count === 2 ? "contractor" : "contractors"}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {urgent && <span className="rounded-full bg-emergency-soft px-2.5 py-0.5 text-xs font-semibold text-emergency">Needs help now</span>}
          {lead.unlocked && lead.urgency && lead.urgency !== "Immediately" && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{lead.urgency}</span>}
          {lead.unlocked ? <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">Unlocked</span> : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600"><Lock className="size-3" aria-hidden /> Locked</span>}
        </div>
      </div>
      {lead.unlocked ? <Details lead={lead} onSaved={onSaved} /> : <Locked lead={lead} price={price} />}
    </li>
  );
}

export default function ContractorLeads() {
  const { listing } = useContractor();
  const { leads, error, replace, reload } = useMyLeads(Boolean(listing));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const justPaid = params.get("unlocked") === "1";
  const [waiting, setWaiting] = useState(justPaid);
  const tabParam = params.get("status");
  const tab: Tab = tabParam === "locked" || CONTRACTOR_LEAD_STATUSES.includes(tabParam as ContractorLeadStatus) ? (tabParam as Tab) : "all";
  const paid = listing ? activePlan(listing) !== "free" : false;
  const price = paid ? leadPrice.paid : leadPrice.free;

  // Coming back from Stripe: the webhook unlocks the request a moment after the payment, so check a few times.
  useEffect(() => {
    if (!justPaid) return;
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
  }, [justPaid, reload]);

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
  const shown = (leads ?? []).filter(
    (l) =>
      (tab === "all" || (tab === "locked" ? !l.unlocked : l.contractor_status === tab)) &&
      (!term || [l.first_name, l.last_name, l.issue, l.unlocked ? [l.phone, l.email, l.city].join(" ") : ""].join(" ").toLowerCase().includes(term)),
  );

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
      <p className="mb-5 max-w-3xl text-sm text-slate-700">
        New requests from customers near you are sent to you automatically. You see the customer&apos;s name and the problem for free. Unlock a request for <strong>${price}</strong> to see how to
        reach them{!paid && <>, or <Link to="/contractor/billing" className="font-semibold text-primary underline">go Featured</Link> and pay ${leadPrice.paid} instead</>}.
      </p>

      {stillWaiting && (
        <p role="status" className="mb-5 flex max-w-3xl items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking your request, this takes a few seconds…
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
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
              <label htmlFor="lead-q" className="sr-only">Search requests</label>
              <input id="lead-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or problem…" className={`${inputClass} !py-2.5 !pl-9`} />
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-lg font-semibold text-navy">No requests yet</p>
              <p className="mt-2 text-sm text-slate-600">When a customer asks for help near you, the request appears here. Make sure your listing is published and your ZIP code and travel distance are set in My business.</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="mt-6 text-sm text-slate-600">No requests match your filters.</p>
          ) : (
            <ul className="mt-5 max-w-4xl space-y-4">
              {shown.map((l) => <LeadCard key={l.id} lead={l} price={price} onSaved={replace} />)}
            </ul>
          )}
        </>
      )}

      <p className="mt-8 max-w-2xl text-xs text-slate-500">
        A request can be sent to up to three contractors, and we can&apos;t guarantee any number of requests or jobs. Customer details are shared so you can respond to their request:
        use them only for that, and follow the rules that apply to calls, texts and emails. Unlocked requests are not refundable.
      </p>
    </>
  );
}
