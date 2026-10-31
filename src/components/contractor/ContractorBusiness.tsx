import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button, buttonClass } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { services } from "@/config/services";
import { isFeatured } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Listing } from "@/lib/types";
import { ConnectGoogle } from "./ConnectGoogle";
import { useContractor } from "./context";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** A paid-only section on a free account: visible but locked, with a way to upgrade. */
function LockedPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-700"><Lock className="size-4 text-slate-500" aria-hidden /> {title}</h2>
        <Link to="/contractor/billing" className={buttonClass("secondary", "!rounded-full !px-4 !py-1.5 text-sm")}>Unlock with Featured</Link>
      </div>
      <div className="mt-3 text-sm text-slate-600">{children}</div>
    </section>
  );
}

function BusinessForm({ listing, reload }: { listing: Listing; reload: () => Promise<void> }) {
  const paid = isFeatured(listing);
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
    const phone = text(f.get("phone"));
    if (name.length < 2 || !city || !state) return setMsg({ ok: false, text: "Business name, city and state are required." });
    if (phone.replace(/\D/g, "").length < 7) return setMsg({ ok: false, text: "Enter a phone number customers can call." });

    const zip = text(f.get("postal_code"));
    if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return setMsg({ ok: false, text: "Enter a valid 5-digit ZIP code." });
    const radius = Number(text(f.get("service_radius_miles")) || 30);
    if (!Number.isInteger(radius) || radius < 5 || radius > 150) return setMsg({ ok: false, text: "Travel distance must be a whole number from 5 to 150 miles." });

    setSaving(true);
    setMsg(null);
    const { error } = await getSupabaseBrowser().from("listings").update({
      business_name: name, phone, address: text(f.get("address")) || null, city, state, postal_code: zip || null, service_radius_miles: radius,
      // Paid-only fields. (The database ignores them for a free account too.)
      ...(paid ? {
        description: text(f.get("description")) || null, services: selected, emergency_service: emergency,
        email: text(f.get("email")) || null, website: text(f.get("website")) || null, service_areas: text(f.get("service_areas")) || null,
      } : {}),
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
      <Panel title="Your directory listing">
        <p className="mb-4 text-sm text-slate-600">
          {paid ? "This is what customers see in the directory, along with the sections below." : "Free listings show your business name, phone number and address in the directory."}
        </p>
        <div className="space-y-4">
          {input("business_name", "Business name", listing.business_name)}
          {input("phone", "Business phone number", listing.phone, { type: "tel" })}
          {input("address", "Street address", listing.address, { optional: true })}
          <div className="grid gap-4 sm:grid-cols-2">
            {input("city", "City", listing.city)}
            {input("state", "State", listing.state)}
          </div>
        </div>
      </Panel>

      <Panel title="Where you work">
        <p className="mb-4 text-sm text-slate-600">Used to send you requests from customers nearby. Your ZIP code and travel distance are not shown publicly.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("postal_code", "ZIP code", listing.postal_code, { hint: "The ZIP code your business is in." })}
          {input("service_radius_miles", "How far will you travel? (miles)", listing.service_radius_miles ?? 30, { type: "number", hint: "5 to 150 miles." })}
        </div>
      </Panel>

      {paid ? (
        <>
          <Panel title="About us">
            <Field id="description" label="Description" optional hint="Tell customers what you do and why they should call you. Up to 2,000 characters.">
              {(a) => <textarea id="description" name="description" rows={6} maxLength={2000} defaultValue={listing.description ?? ""} className={inputClass} {...a} />}
            </Field>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {input("website", "Website", listing.website, { optional: true })}
              {input("email", "Public email", listing.email, { optional: true, type: "email" })}
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

          <Panel title="Service areas">
            {input("service_areas", "Other cities you serve", listing.service_areas, { optional: true, hint: "Cities or counties, separated by commas. Requests from these cities are sent to you too, and you show up on their city pages." })}
          </Panel>

          <Panel title="Google reviews">
            <p className="text-sm text-slate-600">
              Show your Google star rating and review count on your listing and in the directory, taken live from Google. You don&apos;t type anything in. We search Google using your business name, city and state, so make sure those are right and saved first.
            </p>
            <ConnectGoogle listing={listing} reload={reload} />
          </Panel>
        </>
      ) : (
        <>
          <LockedPanel title="About us">Tell customers what you do. Not shown in the directory on the Free plan.</LockedPanel>
          <LockedPanel title="Services">Choose the services you offer and mark emergency service. Not shown in the directory on the Free plan.</LockedPanel>
          <LockedPanel title="Service areas">List the other cities you serve and show up on their city pages.</LockedPanel>
          <LockedPanel title="Google reviews">Connect your Google listing to show your star rating and review count.</LockedPanel>
        </>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving} className="!rounded-full px-8">{saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes</Button>
        <p role="status" className={`text-sm font-medium ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</p>
      </div>
    </form>
  );
}

export default function ContractorBusiness() {
  const { listing, reload } = useContractor();
  return (
    <>
      <PageTitle title="My business" />
      {!listing ? (
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      ) : (
        <BusinessForm key={`${listing.id}-${isFeatured(listing)}`} listing={listing} reload={reload} />
      )}
    </>
  );
}
