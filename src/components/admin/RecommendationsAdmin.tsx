import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { DirectoryTabs } from "./DirectoryTabs";
import { PageTitle, Panel } from "./widgets";

interface Row {
  id: string;
  created_at: string;
  listing_id: string;
  author_name: string;
  author_email: string;
  body: string;
  email_confirmed_at: string | null;
  status: "pending" | "approved" | "rejected";
  listings: { business_name: string; city: string; state: string; slug: string; website: string | null; email: string | null } | null;
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function RecommendationsAdmin() {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<Row[]>(
    [],
    () => supabase.from("listing_recommendations").select("*, listings(business_name, city, state, slug, website, email)").order("created_at", { ascending: false }).limit(300),
    { key: "recommendations", intervalMs: 30_000 },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function decide(r: Row, status: "approved" | "rejected") {
    setBusy(r.id);
    setMsg(null);
    const { error } = await supabase.from("listing_recommendations").update({ status, moderated_at: new Date().toISOString() }).eq("id", r.id);
    setBusy(null);
    if (error) return setMsg({ ok: false, text: "Could not save that decision." });
    setMsg({ ok: true, text: status === "approved" ? "Approved. It is now on the business page." : "Rejected. It will not be shown." });
    void q.reload();
  }

  const ready = q.data.filter((r) => r.status === "pending" && r.email_confirmed_at);
  const unconfirmed = q.data.filter((r) => r.status === "pending" && !r.email_confirmed_at);
  const decided = q.data.filter((r) => r.status !== "pending");

  const businessLine = (r: Row) => (
    <>
      <Link to={`/admin/listings/${r.listing_id}`} className="font-semibold text-navy hover:text-primary">{r.listings?.business_name ?? "Listing"}</Link>
      <span className="text-slate-600"> · {r.listings?.city}, {r.listings?.state}</span>
    </>
  );

  return (
    <>
      <PageTitle title="Directory" />
      <DirectoryTabs />
      <p className="mb-5 text-sm text-slate-600">
        Customers confirm their email, then you decide whether the recommendation is shown. Reject anything that looks written by the business or its friends or family
        (same email domain as the business, copied wording, several at once), offers or asks for money or a favour, names a person, has abuse or unrelated content.
        Do not pick which recommendations to show based on how favourable they are.
      </p>
      {msg && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <Panel title={`Ready to review (${ready.length})`}>
        {ready.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting.</p> : (
          <ul className="space-y-4">
            {ready.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                <p>{businessLine(r)}{r.listings && <Link to={`/directory/${r.listings.slug}`} target="_blank" className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">View page <ExternalLink className="size-3" aria-hidden /></Link>}</p>
                <p className="mt-2 whitespace-pre-line text-slate-800">&ldquo;{r.body}&rdquo;</p>
                <p className="mt-2 text-sm text-slate-600">
                  {r.author_name} (shown name) · <a className="text-primary underline" href={`mailto:${r.author_email}`}>{r.author_email}</a> · {when(r.created_at)}
                </p>
                {r.listings && (r.listings.email || r.listings.website) && (
                  <p className="mt-1 text-xs text-slate-500">Business on file: {[r.listings.email, r.listings.website].filter(Boolean).join(" · ")} (compare the email domain)</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => decide(r, "approved")} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm"><Check className="size-4" aria-hidden /> Approve</Button>
                  <Button variant="secondary" onClick={() => decide(r, "rejected")} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm"><X className="size-4" aria-hidden /> Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-6">
        <Panel title={`Waiting for the customer to confirm their email (${unconfirmed.length})`}>
          {unconfirmed.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {unconfirmed.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{businessLine(r)}</span><span className="text-slate-500">{when(r.created_at)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {decided.length > 0 && (
        <div className="mt-6">
          <Panel title="Decided">
            <ul className="divide-y divide-slate-100 text-sm">
              {decided.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{businessLine(r)} · {r.author_name}</span>
                    <span className="flex items-center gap-3">
                      <span className={r.status === "approved" ? "font-semibold text-green-700" : "text-slate-500"}>{r.status}</span>
                      <button type="button" disabled={busy === r.id} onClick={() => decide(r, r.status === "approved" ? "rejected" : "approved")} className="text-xs font-semibold text-primary hover:underline disabled:opacity-60">
                        {r.status === "approved" ? "Remove" : "Approve instead"}
                      </button>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-slate-600">{r.body}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
