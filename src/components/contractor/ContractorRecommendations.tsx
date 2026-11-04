import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, EyeOff, Quote, Star, X } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button, buttonClass } from "@/components/ui/Button";
import { useLiveQuery } from "@/lib/admin-hooks";
import { isFeatured } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useContractor } from "./context";

interface Row {
  id: string;
  created_at: string;
  author_name: string;
  body: string;
  email_confirmed: boolean;
  status: "pending" | "approved" | "rejected";
  featured: boolean;
}

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function ContractorRecommendations() {
  const { listing } = useContractor();
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<Row[]>([], () => supabase.rpc("my_recommendations"), { key: "my-recommendations", intervalMs: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!listing) {
    return (
      <>
        <PageTitle title="Recommendations" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  const paid = isFeatured(listing);

  async function run(id: string, call: PromiseLike<{ error: { message?: string } | null }>, done: string) {
    setBusy(id);
    setMsg(null);
    const { error } = await call;
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message && /Featured plan|first/.test(error.message) ? error.message : "Could not save that. Please try again." });
    setMsg({ ok: true, text: done });
    void q.reload();
  }
  const decide = (r: Row, status: Row["status"], done: string) => run(r.id, supabase.rpc("decide_my_recommendation", { p_id: r.id, p_status: status }), done);
  const feature = (r: Row, on: boolean) =>
    run(r.id, supabase.rpc("feature_my_recommendation", { p_id: r.id, p_on: on }), on ? "Featured. It now shows above About us on your listing." : "No longer featured.");

  const pending = q.data.filter((r) => r.status === "pending");
  const shown = q.data.filter((r) => r.status === "approved");
  const hidden = q.data.filter((r) => r.status === "rejected");

  const meta = (r: Row) => (
    <p className="mt-2 text-sm text-slate-600">
      <span className="font-semibold text-navy">{r.author_name}</span> · {when(r.created_at)}
      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${r.email_confirmed ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{r.email_confirmed ? "Email confirmed" : "Email not confirmed"}</span>
    </p>
  );

  return (
    <>
      <PageTitle title="Recommendations" />
      <p className="mb-5 max-w-3xl text-sm text-slate-600">
        Customers can recommend your business on your listing page. You decide which ones to show. A recommendation is not shown until you choose to show it, and you cannot edit what a customer wrote.
        Only show recommendations from people who really used your business.
      </p>
      {msg && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <div className="space-y-6">
        <Panel title={`Waiting for you (${pending.length})`}>
          {pending.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting. New recommendations appear here.</p> : (
            <ul className="space-y-4">
              {pending.map((r) => (
                <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="whitespace-pre-line text-slate-800">&ldquo;{r.body}&rdquo;</p>
                  {meta(r)}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => decide(r, "approved", "Shown on your listing.")} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm"><Check className="size-4" aria-hidden /> Show on my listing</Button>
                    <Button variant="secondary" onClick={() => decide(r, "rejected", "Hidden. It will not be shown.")} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm"><X className="size-4" aria-hidden /> Don&apos;t show</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Shown on your listing (${shown.length})`}>
          {shown.length === 0 ? <p className="text-sm text-slate-500">None shown yet.</p> : (
            <>
              {!paid && (
                <p className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-slate-700">
                  With the Featured plan you can feature one recommendation in a highlighted box above About us. <Link to="/contractor/billing" className="font-semibold text-primary underline">See plans</Link>
                </p>
              )}
              <ul className="space-y-4">
                {shown.map((r) => (
                  <li key={r.id} className={`rounded-xl border p-4 ${r.featured ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
                    {r.featured && <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900"><Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden /> Featured above About us</p>}
                    <p className="whitespace-pre-line text-slate-800">&ldquo;{r.body}&rdquo;</p>
                    {meta(r)}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {paid && (r.featured
                        ? <Button variant="secondary" onClick={() => feature(r, false)} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm">Remove from featured</Button>
                        : <Button onClick={() => feature(r, true)} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm"><Quote className="size-4" aria-hidden /> Feature above About us</Button>)}
                      <Button variant="ghost" onClick={() => decide(r, "rejected", "Hidden. It will not be shown.")} disabled={busy === r.id} className="!rounded-full !px-4 !py-1.5 text-sm"><EyeOff className="size-4" aria-hidden /> Hide</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {hidden.length > 0 && (
          <Panel title={`Hidden (${hidden.length})`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {hidden.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0 flex-1 text-slate-600"><span className="font-semibold text-navy">{r.author_name}</span> · <span className="line-clamp-1">{r.body}</span></span>
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, "approved", "Shown on your listing.")} className="text-xs font-semibold text-primary hover:underline disabled:opacity-60">Show instead</button>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <p className="text-sm text-slate-600">
          Want more recommendations? Ask your happy customers to open <Link to={`/directory/${listing.slug}#recommendations`} className={buttonClass("link")}>your listing page</Link> and use the Recommend button.
        </p>
      </div>
    </>
  );
}
