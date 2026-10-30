import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { slugify, usePublishedListings } from "@/lib/directory";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Listing } from "@/lib/types";
import { useContractor } from "./context";

type Pick = { kind: "existing"; listing: Listing } | { kind: "new" } | null;

/** Onboarding: claim an existing listing or add a new business. Either way an admin approves before the account can edit anything. */
export function ClaimListing() {
  const { reload } = useContractor();
  const { data: listings, loading } = usePublishedListings();
  const [term, setTerm] = useState("");
  const [pick, setPick] = useState<Pick>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = term.trim().toLowerCase();
  const matches = t.length < 2 ? [] : listings.filter((l) => `${l.business_name} ${l.city} ${l.state}`.toLowerCase().includes(t)).slice(0, 8);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pick || busy) return;
    const f = new FormData(e.currentTarget);
    const contactName = String(f.get("contact_name") ?? "").trim();
    if (contactName.length < 2) return setError("Enter your name.");
    setBusy(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    let listingId: string;

    if (pick.kind === "existing") {
      listingId = pick.listing.id;
    } else {
      const name = String(f.get("business_name") ?? "").trim();
      const city = String(f.get("city") ?? "").trim();
      const state = String(f.get("state") ?? "").trim();
      if (name.length < 2 || !city || !state) {
        setBusy(false);
        return setError("Business name, city and state are required.");
      }
      listingId = crypto.randomUUID();
      const { error: err } = await supabase.from("listings").insert({
        id: listingId, slug: `${slugify(`${name} ${city}`)}-${listingId.slice(0, 4)}`, status: "pending", source: "submitted",
        business_name: name, city, state, phone: String(f.get("phone") ?? "").trim() || null, website: String(f.get("website") ?? "").trim() || null,
        services: [], emergency_service: false,
      });
      if (err) {
        setBusy(false);
        return setError("We couldn't add the business. Please check the details and try again.");
      }
    }

    const { error: claimError } = await supabase.from("listing_claims").insert({
      listing_id: listingId, contact_name: contactName,
      contact_phone: String(f.get("contact_phone") ?? "").trim() || null, note: String(f.get("note") ?? "").trim() || null,
    });
    setBusy(false);
    if (claimError) return setError(claimError.code === "23505" ? "You've already requested this listing." : "We couldn't send your request. Please try again.");
    await reload();
  }

  return (
    <Panel title="Connect your business">
      <p className="text-sm text-slate-600">
        Find your business in the directory to manage it, or add it if it isn&apos;t there. We check every request before you can edit a listing, so it can take a little while.
      </p>

      {!pick && (
        <div className="mt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
            <label htmlFor="claim-search" className="sr-only">Search the directory by business name</label>
            <input id="claim-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by business name or city…" className={`${inputClass} !pl-9`} />
          </div>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">Loading directory…</p>
          ) : matches.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {matches.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span><span className="block font-semibold text-navy">{l.business_name}</span><span className="text-sm text-slate-600">{l.city}, {l.state}</span></span>
                  <Button variant="secondary" onClick={() => setPick({ kind: "existing", listing: l })} className="!rounded-full !px-4 !py-1.5 text-sm">This is my business</Button>
                </li>
              ))}
            </ul>
          ) : t.length >= 2 ? (
            <p className="mt-3 text-sm text-slate-600">No matching listing found.</p>
          ) : null}
          <p className="mt-5 text-sm text-slate-700">
            Can&apos;t find it? <button type="button" onClick={() => setPick({ kind: "new" })} className="font-semibold text-primary hover:underline">Add my business</button>
          </p>
        </div>
      )}

      {pick && (
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            {pick.kind === "existing" ? <>Requesting access to <strong>{pick.listing.business_name}</strong> ({pick.listing.city}, {pick.listing.state}).</> : "Adding a new business."}{" "}
            <button type="button" onClick={() => { setPick(null); setError(null); }} className="font-semibold text-primary hover:underline">Change</button>
          </p>
          {pick.kind === "new" && (
            <>
              <Field id="business_name" label="Business name">{(a) => <input id="business_name" name="business_name" className={inputClass} {...a} />}</Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="city" label="City">{(a) => <input id="city" name="city" className={inputClass} {...a} />}</Field>
                <Field id="state" label="State">{(a) => <input id="state" name="state" className={inputClass} {...a} />}</Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="phone" label="Business phone" optional>{(a) => <input id="phone" name="phone" type="tel" className={inputClass} {...a} />}</Field>
                <Field id="website" label="Website" optional>{(a) => <input id="website" name="website" className={inputClass} {...a} />}</Field>
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="contact_name" label="Your name">{(a) => <input id="contact_name" name="contact_name" autoComplete="name" className={inputClass} {...a} />}</Field>
            <Field id="contact_phone" label="Your phone" optional>{(a) => <input id="contact_phone" name="contact_phone" type="tel" autoComplete="tel" className={inputClass} {...a} />}</Field>
          </div>
          <Field id="note" label="How can we confirm you represent this business?" optional hint="For example your work email address, or a call-back number that matches the business.">
            {(a) => <textarea id="note" name="note" rows={3} maxLength={1000} className={inputClass} {...a} />}
          </Field>
          <div role="alert">{error && <p className="text-sm font-medium text-red-700">{error}</p>}</div>
          <Button type="submit" disabled={busy} className="!rounded-full">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Send request
          </Button>
        </form>
      )}
    </Panel>
  );
}
