import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { ListingClaim } from "@/lib/types";
import { DirectoryTabs } from "./DirectoryTabs";
import { PageTitle, Panel } from "./widgets";

type ClaimRow = ListingClaim & { listings: { business_name: string; city: string; state: string; status: string; website: string | null; phone: string | null } | null };

export function ClaimsAdmin() {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<ClaimRow[]>(
    [],
    () => supabase.from("listing_claims").select("*, listings(business_name, city, state, status, website, phone)").order("created_at", { ascending: false }).limit(200),
    { key: "claims", intervalMs: 30_000 },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function decide(c: ClaimRow, approve: boolean) {
    setBusy(c.id);
    setMsg(null);
    if (approve) {
      const { error } = await supabase.from("listing_owners").insert({ listing_id: c.listing_id, user_id: c.user_id });
      if (error) {
        setBusy(null);
        return setMsg({ ok: false, text: error.code === "23505" ? "That listing already has an owner. Remove the existing owner in Supabase first, or reject this claim." : "Could not approve the claim." });
      }
    }
    await supabase.from("listing_claims").update({ status: approve ? "approved" : "rejected" }).eq("id", c.id);
    setBusy(null);
    setMsg({ ok: true, text: approve ? "Approved. The contractor can now manage this listing." : "Rejected." });
    void q.reload();
  }

  const pending = q.data.filter((c) => c.status === "pending");
  const done = q.data.filter((c) => c.status !== "pending");

  return (
    <>
      <PageTitle title="Directory" />
      <DirectoryTabs />
      <p className="mb-5 max-w-3xl text-sm text-slate-600">
        Contractors ask to manage a listing. Check that the person represents the business (compare their email and phone with the business&apos;s website or phone number) before approving.
        Approving lets them edit the listing&apos;s details; it does not publish a pending listing.
      </p>
      {msg && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <Panel title={`Waiting for review (${pending.length})`}>
        {pending.length === 0 ? <p className="text-sm text-slate-500">No claims waiting.</p> : (
          <ul className="space-y-4">
            {pending.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-navy">
                  {c.listings?.business_name ?? "Listing"} <span className="font-normal text-slate-600">· {c.listings?.city}, {c.listings?.state} · {c.listings?.status}</span>
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Requested by <strong>{c.contact_name}</strong> · <a className="text-primary underline" href={`mailto:${c.user_email}`}>{c.user_email}</a>{c.contact_phone ? ` · ${c.contact_phone}` : ""}
                </p>
                {c.note && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">&ldquo;{c.note}&rdquo;</p>}
                <p className="mt-1 text-xs text-slate-500">
                  Business phone on file: {c.listings?.phone ?? "none"} · <Link to={`/admin/listings/${c.listing_id}`} className="font-semibold text-primary hover:underline">Open listing <ExternalLink className="inline size-3" aria-hidden /></Link>
                </p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => decide(c, true)} disabled={busy === c.id} className="!rounded-full !px-4 !py-1.5 text-sm"><Check className="size-4" aria-hidden /> Approve</Button>
                  <Button variant="secondary" onClick={() => decide(c, false)} disabled={busy === c.id} className="!rounded-full !px-4 !py-1.5 text-sm"><X className="size-4" aria-hidden /> Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {done.length > 0 && (
        <div className="mt-6">
          <Panel title="Decided">
            <ul className="divide-y divide-slate-100 text-sm">
              {done.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{c.listings?.business_name ?? "Listing"} · {c.user_email}</span>
                  <span className={c.status === "approved" ? "font-semibold text-green-700" : "text-slate-500"}>{c.status}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
