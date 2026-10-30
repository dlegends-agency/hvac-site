import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser } from "@/lib/supabase";
import { activePlan } from "@/lib/plans";
import { LEAD_STATUSES, type Lead, type LeadStatus, type Listing, type PlanId } from "@/lib/types";

interface Assignment {
  listing_id: string;
  assigned_at: string;
  source: "auto" | "manual";
  contractor_status: string;
  contacted_at: string | null;
  listings: { business_name: string; city: string; plan: PlanId; plan_until: string | null } | null;
}
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
  const [owned, setOwned] = useState<Listing[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Listings that have a contractor account attached (only these can receive leads).
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.from("listing_owners").select("listing_id").then(async ({ data }) => {
      const ids = ((data as { listing_id: string }[] | null) ?? []).map((r) => r.listing_id);
      if (ids.length === 0) return;
      const { data: rows } = await supabase.from("listings").select("id,business_name,city,state,plan,plan_until").in("id", ids).order("business_name");
      setOwned((rows as Listing[] | null) ?? []);
    });
  }, []);

  const loadAssignments = useCallback(async () => {
    const { data } = await getSupabaseBrowser()
      .from("lead_assignments")
      .select("listing_id, assigned_at, source, contractor_status, contacted_at, listings(business_name, city, plan, plan_until)")
      .eq("lead_id", id)
      .order("assigned_at");
    setAssignments((data as unknown as Assignment[] | null) ?? []);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.from("listing_owners").select("listing_id").then(async ({ data }) => {
      const ids = ((data as { listing_id: string }[] | null) ?? []).map((r) => r.listing_id);
      if (ids.length === 0) return;
      const { data: rows } = await supabase.from("listings").select("id,business_name,city,state,plan,plan_until").in("id", ids).order("business_name");
      setOwned((rows as Listing[] | null) ?? []);
    });
  }, []);

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

  async function addContractor(listingId: string) {
    if (!listingId) return;
    setSaving(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().from("lead_assignments").insert({ lead_id: id, listing_id: listingId, source: "manual" });
    setSaving(false);
    if (error) return setMsg("Could not add. Make sure the latest contractor SQL has been run.");
    setMsg("Sent. The contractor can see it in their dashboard.");
    void loadAssignments();
  }

  async function removeContractor(listingId: string) {
    setSaving(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().from("lead_assignments").delete().eq("lead_id", id).eq("listing_id", listingId);
    setSaving(false);
    if (error) return setMsg("Could not remove.");
    setMsg("Removed.");
    void loadAssignments();
  }

  async function routeNow() {
    setSaving(true);
    setMsg(null);
    const { data, error } = await getSupabaseBrowser().rpc("admin_route_lead", { p_lead: id });
    setSaving(false);
    if (error) return setMsg("Could not route. Make sure the latest contractor SQL has been run.");
    const n = Number(data ?? 0);
    setMsg(n > 0 ? `Sent to ${n} more matching contractor${n === 1 ? "" : "s"}.` : "No more matching contractors (they may already have it, or none cover this city).");
    void loadAssignments();
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
                <Panel title={`Sent to contractors (${assignments.length})`}>
                  {assignments.length === 0 ? (
                    <p className="text-sm text-slate-600">Not sent to anyone yet. New leads go automatically to Featured and Premium contractors that serve the customer&apos;s city.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {assignments.map((a) => (
                        <li key={a.listing_id} className="flex items-start justify-between gap-2 py-2.5">
                          <span className="min-w-0 text-sm">
                            <Link to={`/admin/listings/${a.listing_id}`} className="font-semibold text-navy hover:text-primary hover:underline">{a.listings?.business_name ?? "Listing"}</Link>
                            <span className="block text-xs text-slate-500">
                              {a.listings?.city} · {a.listings ? activePlan(a.listings) : ""} · {a.source === "auto" ? "automatic" : "added by you"}
                            </span>
                            <span className="block text-xs capitalize text-slate-600">Status: {a.contractor_status}{a.contacted_at ? ` (contacted ${new Date(a.contacted_at).toLocaleDateString()})` : ""}</span>
                          </span>
                          <button type="button" disabled={saving} onClick={() => removeContractor(a.listing_id)} className="shrink-0 text-xs font-semibold text-red-700 hover:underline disabled:opacity-60">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label htmlFor="assign" className="mt-3 mb-1 block text-sm font-semibold text-navy">Add a contractor</label>
                  <select id="assign" value="" disabled={saving} onChange={(e) => addContractor(e.target.value)} className={inputClass}>
                    <option value="">Choose…</option>
                    {owned.filter((l) => !assignments.some((a) => a.listing_id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.business_name} ({l.city}) · {activePlan(l)}</option>)}
                  </select>
                  {owned.length === 0 && <p className="mt-2 text-xs text-slate-500">No contractor accounts yet. Approve a claim in Directory &gt; Claims first.</p>}
                  <Button variant="secondary" onClick={routeNow} disabled={saving} className="mt-3 w-full !py-2 text-sm">Send to matching contractors</Button>
                  <p className="mt-2 text-xs text-slate-500">Contractors see the customer&apos;s name, phone, email and request, and each keeps their own status and notes.</p>
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
