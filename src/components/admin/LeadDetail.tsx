import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser } from "@/lib/supabase";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";
import { Panel, QueryState, StatusBadge } from "./widgets";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-semibold text-navy">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-700 sm:col-span-2 sm:mt-0">{value || "—"}</dd>
    </div>
  );
}

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSupabaseBrowser()
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        setError(Boolean(error));
        setLead(data as Lead | null);
        setNotes((data as Lead | null)?.notes ?? "");
        setLoading(false);
      });
  }, [id]);

  async function update(patch: Partial<Pick<Lead, "status" | "notes">>) {
    setSaving(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().from("leads").update(patch).eq("id", id);
    setSaving(false);
    if (error) return setMsg("Could not save. Please try again.");
    setLead((l) => (l ? { ...l, ...patch } : l));
    setMsg("Saved.");
  }

  return (
    <>
      <Link to="/admin/leads" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden /> All leads
      </Link>
      <QueryState loading={loading} error={error}>
        {!lead ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Lead not found.</p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-navy">{lead.first_name} {lead.last_name}</h1>
                <p className="mt-1 text-sm text-slate-500">Submitted {new Date(lead.created_at).toLocaleString()}{lead.source ? ` · ${lead.source}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className={buttonClass("primary", "!py-2")}><Phone className="size-4" aria-hidden /> Call</a>
                <a href={`mailto:${lead.email}`} className={buttonClass("secondary", "!py-2")}><Mail className="size-4" aria-hidden /> Email</a>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Panel title="Request">
                  <dl className="divide-y divide-slate-100">
                    <Row label="HVAC issue" value={lead.issue} />
                    <Row label="Urgency" value={lead.urgency} />
                    <Row label="Description" value={<span className="whitespace-pre-line">{lead.description}</span>} />
                    <Row label="Property" value={`${lead.property_type} · ${lead.property_status}`} />
                  </dl>
                </Panel>
                <Panel title="Service location">
                  <dl className="divide-y divide-slate-100">
                    <Row label="Street" value={lead.street} />
                    <Row label="Unit" value={lead.unit} />
                    <Row label="City" value={lead.city} />
                    <Row label="State / province" value={lead.state} />
                    <Row label="ZIP / postal code" value={lead.postal_code} />
                    <Row label="Country" value={lead.country} />
                  </dl>
                </Panel>
                <Panel title="Contact">
                  <dl className="divide-y divide-slate-100">
                    <Row label="Phone" value={<a className="text-primary underline" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>{lead.phone}</a>} />
                    <Row label="Email" value={<a className="text-primary underline" href={`mailto:${lead.email}`}>{lead.email}</a>} />
                    <Row label="Preferred method" value={lead.contact_method} />
                    <Row label="Preferred time" value={lead.preferred_contact_time} />
                    <Row label="Referral acknowledged" value={lead.referral_acknowledgment ? "Yes" : "No"} />
                    <Row label="Marketing consent" value={lead.marketing_consent ? "Yes" : "No"} />
                  </dl>
                </Panel>
              </div>

              <div className="space-y-6">
                <Panel title="Status">
                  <div className="mb-3"><StatusBadge status={lead.status} /></div>
                  <label htmlFor="status" className="sr-only">Change status</label>
                  <select id="status" value={lead.status} disabled={saving} onChange={(e) => update({ status: e.target.value as LeadStatus })}
                    className={`${inputClass} capitalize`}>
                    {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Panel>
                <Panel title="Internal notes">
                  <label htmlFor="notes" className="sr-only">Internal notes</label>
                  <textarea id="notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass}
                    placeholder="Who you called, what was said, next steps…" />
                  <Button className="mt-3" disabled={saving || notes === (lead.notes ?? "")} onClick={() => update({ notes: notes || null })}>
                    Save notes
                  </Button>
                  <p role="status" className="mt-2 text-sm text-slate-600">{msg}</p>
                </Panel>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
