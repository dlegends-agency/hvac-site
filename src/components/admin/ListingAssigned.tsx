import { Link } from "react-router-dom";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Panel } from "./widgets";

interface LeadRow { lead_id: string; assigned_at: string; contractor_status: string; unlocked_at: string | null; leads: { first_name: string; last_name: string; issue: string; city: string; state: string; urgency: string } | null }
interface Opp { kind: "permit" | "bid"; item_id: string; title: string; city: string | null; state: string | null; happened_on: string | null; unlocked: boolean }
interface Data { leads: LeadRow[]; opps: Opp[]; oppsReady: boolean }

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "no date");

/** Admin > Directory > one listing: the customer leads routed to this business, and the permits and government bids that reach its area. */
export function ListingAssigned({ listingId, claimed }: { listingId: string; claimed: boolean }) {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<Data | null>(null, async () => {
    const [a, o] = await Promise.all([
      supabase.from("lead_assignments").select("lead_id,assigned_at,contractor_status,unlocked_at,leads(first_name,last_name,issue,city,state,urgency)").eq("listing_id", listingId).order("assigned_at", { ascending: false }).limit(200),
      supabase.rpc("admin_listing_opportunities", { p_listing: listingId }),
    ]);
    return { data: { leads: (a.data ?? []) as unknown as LeadRow[], opps: (o.data ?? []) as Opp[], oppsReady: !o.error }, error: null };
  }, { key: `listing-assigned-${listingId}`, intervalMs: 60_000 });

  const d = q.data;
  const permits = d?.opps.filter((x) => x.kind === "permit") ?? [];
  const bids = d?.opps.filter((x) => x.kind === "bid") ?? [];

  return (
    <Panel title="Leads, permits and bids for this business">
      {!d ? <p className="text-sm text-slate-500">Loading...</p> : (
        <div className="space-y-4 text-sm">
          {!claimed && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Not claimed yet: these are matched and held for this business. Nothing is emailed or shown to customers until an owner claim is approved; then they appear in the owner&apos;s dashboard.</p>}
          <section>
            <h3 className="mb-1 font-bold text-navy">Customer leads ({d.leads.length})</h3>
            {d.leads.length === 0 ? <p className="text-xs text-slate-500">No customer leads routed to this business.</p> : (
              <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
                {d.leads.map((l) => (
                  <li key={l.lead_id} className="py-1.5">
                    <Link to={`/admin/leads/${l.lead_id}`} className="font-medium text-primary hover:underline">{l.leads ? `${l.leads.first_name} ${l.leads.last_name.slice(0, 1)}. · ${l.leads.issue}` : "Lead"}</Link>
                    <p className="text-xs text-slate-500">{day(l.assigned_at)}{l.leads ? ` · ${l.leads.city}, ${l.leads.state} · ${l.leads.urgency}` : ""} · {l.unlocked_at ? "unlocked" : "not unlocked"} · {l.contractor_status}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {!d.oppsReady ? (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">To list permits and bids here, run <code>supabase/update-2026-11-25-admin-listing-opportunities.sql</code> in the Supabase SQL Editor.</p>
          ) : (
            [["Permits", permits, "/admin/permits"], ["Government bids", bids, "/admin/bids"]].map(([title, rows, to]) => (
              <section key={title as string}>
                <h3 className="mb-1 font-bold text-navy">{title as string} in this business&apos;s area ({(rows as Opp[]).length}{(rows as Opp[]).length === 200 ? "+" : ""})</h3>
                {(rows as Opp[]).length === 0 ? <p className="text-xs text-slate-500">None reach this business yet (check its city, service areas and ZIP code).</p> : (
                  <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
                    {(rows as Opp[]).map((x) => (
                      <li key={x.item_id} className="py-1.5">
                        <Link to={to as string} className="font-medium text-navy hover:underline">{x.title}</Link>
                        <p className="text-xs text-slate-500">{day(x.happened_on)} · {[x.city, x.state].filter(Boolean).join(", ")} · {x.unlocked ? "unlocked by the business" : "not unlocked"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </div>
      )}
    </Panel>
  );
}
