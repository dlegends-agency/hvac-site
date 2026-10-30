import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser } from "@/lib/supabase";
import { CONTRACTOR_LEAD_STATUSES, type ContractorLead, type ContractorLeadStatus } from "@/lib/types";
import { useContractor } from "./context";

const badge: Record<ContractorLeadStatus, string> = {
  new: "bg-blue-100 text-blue-800", contacted: "bg-amber-100 text-amber-900", won: "bg-green-100 text-green-800", lost: "bg-slate-200 text-slate-700",
};

function LeadCard({ lead, onSaved }: { lead: ContractorLead; onSaved: (l: ContractorLead) => void }) {
  const [status, setStatus] = useState(lead.contractor_status);
  const [notes, setNotes] = useState(lead.contractor_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = status !== lead.contractor_status || notes !== (lead.contractor_notes ?? "");
  const tel = `tel:${lead.phone.replace(/[^\d+]/g, "")}`;

  async function save() {
    setSaving(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().rpc("update_my_lead", { p_id: lead.id, p_status: status, p_notes: notes });
    setSaving(false);
    if (error) return setMsg("Could not save. Please try again.");
    onSaved({ ...lead, contractor_status: status, contractor_notes: notes || null });
    setMsg("Saved.");
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-navy">{lead.first_name} {lead.last_name}</p>
          <p className="text-sm text-slate-600">{lead.issue} · <span className="font-medium">{lead.urgency}</span></p>
          <p className="text-xs text-slate-500">Assigned {new Date(lead.assigned_at ?? lead.created_at).toLocaleString()}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badge[lead.contractor_status]}`}>{lead.contractor_status}</span>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-navy">Address</dt><dd className="text-slate-700">{[lead.street, lead.unit, `${lead.city}, ${lead.state} ${lead.postal_code}`].filter(Boolean).join(", ")}</dd></div>
        <div><dt className="font-semibold text-navy">Property</dt><dd className="text-slate-700">{lead.property_type} · {lead.property_status}</dd></div>
        <div><dt className="font-semibold text-navy">Preferred contact</dt><dd className="text-slate-700">{lead.contact_method}{lead.preferred_contact_time ? ` · ${lead.preferred_contact_time}` : ""}</dd></div>
        {lead.description && <div className="sm:col-span-2"><dt className="font-semibold text-navy">What they said</dt><dd className="whitespace-pre-line text-slate-700">{lead.description}</dd></div>}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={tel} className={buttonClass("primary", "!rounded-full !px-4 !py-2 text-sm")}><Phone className="size-4" aria-hidden /> {lead.phone}</a>
        <a href={`mailto:${lead.email}`} className={buttonClass("secondary", "!rounded-full !px-4 !py-2 text-sm")}><Mail className="size-4" aria-hidden /> {lead.email}</a>
      </div>

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[10rem_1fr]">
        <div>
          <label htmlFor={`st-${lead.id}`} className="sr-only">Status</label>
          <select id={`st-${lead.id}`} value={status} onChange={(e) => setStatus(e.target.value as ContractorLeadStatus)} className={`${inputClass} capitalize`}>
            {CONTRACTOR_LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`nt-${lead.id}`} className="sr-only">Notes</label>
          <textarea id={`nt-${lead.id}`} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Your notes (only you can see these)" className={inputClass} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty} className="!rounded-full !px-5 !py-2 text-sm">Save</Button>
        <span role="status" className="text-sm text-slate-600">{msg}</span>
      </div>
    </li>
  );
}

export default function ContractorLeads() {
  const { listing } = useContractor();
  const [leads, setLeads] = useState<ContractorLead[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!listing) return;
    getSupabaseBrowser().rpc("my_leads").then(({ data, error: err }) => {
      setError(Boolean(err));
      setLeads((data as ContractorLead[] | null) ?? []);
    });
  }, [listing]);

  return (
    <>
      <PageTitle title="Customer requests" />
      {!listing ? (
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      ) : error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Requests couldn&apos;t be loaded. Make sure the latest database setup has been run.</p>
      ) : leads === null ? (
        <p className="text-slate-600">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-navy">No requests assigned to you yet</p>
          <p className="mt-2 text-sm text-slate-600">
            When a customer asks for help in your area, our team may assign the request to you, and it will appear here with their contact details.
            Premium contractors are eligible. Requests aren&apos;t guaranteed.
          </p>
          <Link to="/contractor/billing" className={buttonClass("secondary", "mt-5 !rounded-full")}>See plans</Link>
        </div>
      ) : (
        <ul className="max-w-4xl space-y-4">
          {leads.map((l) => <LeadCard key={l.id} lead={l} onSaved={(u) => setLeads((all) => all?.map((x) => (x.id === u.id ? u : x)) ?? null)} />)}
        </ul>
      )}
      <p className="mt-6 max-w-2xl text-xs text-slate-500">
        Customer details are shared so you can respond to their request. Use them only to contact the customer about that request, and follow the rules that apply to calls, texts and emails.
      </p>
    </>
  );
}
