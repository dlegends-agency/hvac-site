import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { services } from "@/config/services";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Listing } from "@/lib/types";
import { useContractor } from "./context";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function ProfileForm({ listing, reload }: { listing: Listing; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>(listing.services);
  const [emergency, setEmergency] = useState(listing.emergency_service);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const f = new FormData(e.currentTarget);
    const name = text(f.get("business_name"));
    const city = text(f.get("city"));
    const state = text(f.get("state"));
    if (name.length < 2 || !city || !state) return setMsg({ ok: false, text: "Business name, city and state are required." });

    setSaving(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().from("listings").update({
      business_name: name, description: text(f.get("description")) || null, services: selected, emergency_service: emergency,
      phone: text(f.get("phone")) || null, email: text(f.get("email")) || null, website: text(f.get("website")) || null,
      address: text(f.get("address")) || null, city, state, postal_code: text(f.get("postal_code")) || null, service_areas: text(f.get("service_areas")) || null
    }).eq("id", listing.id);
    setSaving(false);
    if (error) return setMsg({ ok: false, text: "Could not save. Please check your entries and try again." });
    setMsg({ ok: true, text: "Saved." });
    void reload();
  }

  const toggle = (s: string) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const input = (id: string, label: string, value: string | number | null | undefined, opts: { optional?: boolean; type?: string; hint?: string } = {}) => (
    <Field id={id} label={label} optional={opts.optional} hint={opts.hint}>
      {(a) => <input id={id} name={id} type={opts.type ?? "text"} defaultValue={value ?? ""} className={inputClass} {...a} />}
    </Field>
  );

  return (
    <form onSubmit={save} noValidate className="max-w-3xl space-y-6">
      <Panel title="Business details">
        <div className="space-y-4">
          {input("business_name", "Business name", listing.business_name)}
          <Field id="description" label="Description" optional hint="Tell customers what you do and why they should call you. Up to 2,000 characters.">
            {(a) => <textarea id="description" name="description" rows={6} maxLength={2000} defaultValue={listing.description ?? ""} className={inputClass} {...a} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("phone", "Phone", listing.phone, { optional: true, type: "tel" })}
            {input("email", "Public email", listing.email, { optional: true, type: "email" })}
          </div>
          {input("website", "Website", listing.website, { optional: true })}
          {input("address", "Street address", listing.address, { optional: true })}
          <div className="grid gap-4 sm:grid-cols-3">
            {input("city", "City", listing.city)}
            {input("state", "State", listing.state)}
            {input("postal_code", "ZIP", listing.postal_code, { optional: true })}
          </div>
          {input("service_areas", "Areas you serve", listing.service_areas, { optional: true, hint: "Cities or counties, separated by commas. Used to show you on nearby city pages." })}
        </div>
      </Panel>

      <Panel title="Services">
        <ul className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 has-[:checked]:border-primary has-[:checked]:bg-blue-50">
                <input type="checkbox" checked={selected.includes(s.name)} onChange={() => toggle(s.name)} className="size-4 accent-primary" /> {s.name}
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
          <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} className="size-4 accent-primary" /> We offer emergency service
        </label>
      </Panel>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving} className="!rounded-full px-8">{saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
        <p role="status" className={`text-sm font-medium ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</p>
      </div>
    </form>
  );
}

export default function ContractorProfile() {
  const { listing, reload } = useContractor();
  return (
    <>
      <PageTitle title="My profile" />
      {!listing ? (
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      ) : (
        <ProfileForm key={listing.updated_at} listing={listing} reload={reload} />
      )}
    </>
  );
}
