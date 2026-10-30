import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { services } from "@/config/services";
import { safeUrl, slugify } from "@/lib/directory";
import { getSupabaseBrowser } from "@/lib/supabase";
import { LISTING_STATUSES, type Listing, type ListingPrivate, type ListingStatus, type PlanId } from "@/lib/types";
import { Panel, QueryState } from "./widgets";

interface Draft {
  business_name: string;
  slug: string;
  status: ListingStatus;
  description: string;
  services: string[];
  emergency_service: boolean;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  service_areas: string;
  plan: PlanId;
  plan_until: string;
}

const empty: Draft = {
  business_name: "", slug: "", status: "published", description: "", services: [], emergency_service: false,
  phone: "", email: "", website: "", address: "", city: "", state: "", postal_code: "", service_areas: "", plan: "free", plan_until: "",
};

export function ListingEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(empty);
  const [priv, setPriv] = useState<ListingPrivate | null>(null);
  const [meta, setMeta] = useState<{ source: string; sourceUrl: string | null; attribution: string | null; placeId: string | null } | null>(null);
  const [notes, setNotes] = useState("");
  // False until contractor SQL has been run (the plan columns do not exist yet), so saving keeps working before then.
  const [planColumn, setPlanColumn] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    const supabase = getSupabaseBrowser();
    Promise.all([
      supabase.from("listings").select("*").eq("id", id).maybeSingle(),
      supabase.from("listing_private").select("*").eq("listing_id", id).maybeSingle(),
    ]).then(([l, p]) => {
      const row = l.data as Listing | null;
      if (row) setPlanColumn(row.plan !== undefined);
      if (row) setMeta({ source: row.source ?? "submitted", sourceUrl: row.source_url ?? null, attribution: row.attribution ?? null, placeId: row.google_place_id ?? null });
      if (!row) setMissing(true);
      else {
        setSlugTouched(true);
        setDraft({
          business_name: row.business_name, slug: row.slug, status: row.status, description: row.description ?? "",
          services: row.services, emergency_service: row.emergency_service, phone: row.phone ?? "", email: row.email ?? "",
          website: row.website ?? "", address: row.address ?? "", city: row.city, state: row.state,
          postal_code: row.postal_code ?? "", service_areas: row.service_areas ?? "",
          plan: row.plan ?? "free", plan_until: row.plan_until ? row.plan_until.slice(0, 10) : "",
        });
      }
      const pr = p.data as ListingPrivate | null;
      setPriv(pr);
      setNotes(pr?.admin_notes ?? "");
      setLoading(false);
    });
  }, [id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const field = (k: keyof Draft, label: string, opts: { optional?: boolean; type?: string; hint?: string; onChange?: (v: string) => void } = {}) => (
    <Field id={k} label={label} optional={opts.optional} hint={opts.hint}>
      {(a) => (
        <input id={k} type={opts.type ?? "text"} value={draft[k] as string} className={inputClass} {...a}
          onChange={(e) => (opts.onChange ? opts.onChange(e.target.value) : set(k, e.target.value as never))} />
      )}
    </Field>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!draft.business_name.trim() || !draft.slug || !draft.city.trim() || !draft.state.trim()) {
      return setMsg({ ok: false, text: "Business name, URL slug, city and state are required." });
    }
    setSaving(true);
    setMsg(null);
    const row = {
      business_name: draft.business_name.trim(), slug: draft.slug, status: draft.status,
      description: draft.description.trim() || null, services: draft.services, emergency_service: draft.emergency_service,
      phone: draft.phone.trim() || null, email: draft.email.trim() || null, website: draft.website.trim() || null,
      address: draft.address.trim() || null, city: draft.city.trim(), state: draft.state.trim(),
      postal_code: draft.postal_code.trim() || null, service_areas: draft.service_areas.trim() || null,
      ...(planColumn || draft.plan !== "free" ? { plan: draft.plan, plan_until: draft.plan_until ? new Date(`${draft.plan_until}T23:59:59Z`).toISOString() : null } : {}),
    };
    const supabase = getSupabaseBrowser();
    const res = id
      ? await supabase.from("listings").update(row).eq("id", id).select().single()
      : await supabase.from("listings").insert(row).select().single();
    if (res.error) {
      setSaving(false);
      return setMsg({ ok: false, text: res.error.code === "23505" ? "That URL slug is already used." : "Could not save. Check the slug uses only lowercase letters, numbers and hyphens." });
    }
    const saved = res.data as Listing;
    if (notes !== (priv?.admin_notes ?? "")) {
      await supabase.from("listing_private").upsert({ listing_id: saved.id, submitter_name: priv?.submitter_name ?? null, submitter_email: priv?.submitter_email ?? null, admin_notes: notes || null });
    }
    setSaving(false);
    setMsg({ ok: true, text: "Saved." });
    if (!id) navigate(`/admin/listings/${saved.id}`, { replace: true });
  }

  async function remove() {
    if (!id || !window.confirm("Delete this listing permanently?")) return;
    const { error } = await getSupabaseBrowser().from("listings").delete().eq("id", id);
    if (error) return setMsg({ ok: false, text: "Could not delete." });
    navigate("/admin/listings", { replace: true });
  }

  return (
    <>
      <Link to="/admin/listings" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden /> All listings
      </Link>
      <QueryState loading={loading} error={false}>
        {missing ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Listing not found.</p>
        ) : (
          <form onSubmit={save} className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-navy">{id ? "Edit listing" : "New listing"}</h1>
                {id && draft.status === "published" && (
                  <Link to={`/directory/${draft.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    View live <ExternalLink className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
              {field("business_name", "Business name", { onChange: (v) => { set("business_name", v); if (!slugTouched) set("slug", slugify(`${v} ${draft.city}`)); } })}
              {field("slug", "URL slug", { hint: `Page address: /directory/${draft.slug || "your-slug"}`, onChange: (v) => { setSlugTouched(true); set("slug", slugify(v)); } })}
              <div className="grid gap-4 sm:grid-cols-2">
                {field("city", "City")}
                {field("state", "State")}
                {field("address", "Street address", { optional: true })}
                {field("postal_code", "ZIP / postal code", { optional: true })}
                {field("phone", "Phone", { optional: true, type: "tel" })}
                {field("email", "Public email", { optional: true, type: "email" })}
              </div>
              {field("website", "Website", { optional: true })}
              {field("service_areas", "Service areas", { optional: true })}
              <Field id="description" label="Description" optional>
                {(a) => <textarea id="description" rows={5} value={draft.description} className={inputClass} {...a} onChange={(e) => set("description", e.target.value)} />}
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-navy">Services</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <input type="checkbox" className="size-4 accent-primary" checked={draft.services.includes(s.name)}
                        onChange={(e) => set("services", e.target.checked ? [...draft.services, s.name] : draft.services.filter((x) => x !== s.name))} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" className="size-4 accent-primary" checked={draft.emergency_service} onChange={(e) => set("emergency_service", e.target.checked)} />
                Offers emergency service (as stated by the business)
              </label>
            </div>

            <div className="space-y-5">
              <Panel title="Publishing">
                <label htmlFor="status" className="sr-only">Status</label>
                <select id="status" value={draft.status} onChange={(e) => set("status", e.target.value as ListingStatus)} className={`${inputClass} capitalize`}>
                  {LISTING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <p className="mt-2 text-xs text-slate-500">Only &quot;published&quot; listings are public. Review the details before publishing, since the directory doesn&apos;t verify credentials.</p>
              </Panel>
              <Panel title="Plan (advertising)">
                <label htmlFor="plan" className="sr-only">Plan</label>
                <select id="plan" value={draft.plan} onChange={(e) => set("plan", e.target.value as PlanId)} className={`${inputClass} capitalize`}>
                  <option value="free">Basic (free)</option><option value="featured">Featured</option><option value="premium">Premium</option>
                </select>
                <label htmlFor="plan_until" className="mt-3 mb-1 block text-sm font-semibold text-navy">Paid until <span className="font-normal text-slate-500">(optional)</span></label>
                <input id="plan_until" type="date" value={draft.plan_until} onChange={(e) => set("plan_until", e.target.value)} className={inputClass} />
                <p className="mt-2 text-xs text-slate-500">Stripe subscriptions set this automatically. Use it to give a manual or free trial plan; it reverts to Basic after the date.</p>
              </Panel>
              {meta && (
                <Panel title="Source">
                  <p className="text-sm text-slate-700">{meta.source === "agent" ? "Found by the discovery agent" : <span className="capitalize">{meta.source}</span>}</p>
                  {safeUrl(meta.sourceUrl) && (
                    <a href={safeUrl(meta.sourceUrl)!} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                      View source page
                    </a>
                  )}
                  {meta.attribution && <p className="mt-2 text-xs text-slate-500">{meta.attribution}</p>}
                  {meta.placeId && (
                    <a href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(meta.placeId)}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                      Connected Google listing (check it is the right business)
                    </a>
                  )}
                  {meta.source === "agent" && <p className="mt-2 text-xs text-slate-500">Verify every detail on the business&apos;s own website before publishing.</p>}
                </Panel>
              )}
              {priv && (
                <Panel title="Submitted by (private)">
                  <p className="text-sm text-slate-700">{priv.submitter_name}</p>
                  {priv.submitter_email && <a className="text-sm text-primary underline" href={`mailto:${priv.submitter_email}`}>{priv.submitter_email}</a>}
                </Panel>
              )}
              <Panel title="Internal notes">
                <label htmlFor="notes" className="sr-only">Internal notes</label>
                <textarea id="notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              </Panel>
              <div role="status" aria-live="polite">
                {msg && <p className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Save</Button>
                {id && <Button variant="secondary" onClick={remove}>Delete</Button>}
              </div>
            </div>
          </form>
        )}
      </QueryState>
    </>
  );
}
