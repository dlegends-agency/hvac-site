import { Link } from "react-router-dom";
import { useLiveQuery } from "@/lib/admin-hooks";
import { money } from "@/lib/flow";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Health {
  leads_24h: number;
  leads_7d: number;
  unmatched: number;
  alerts_failed: number;
  alerts_waiting: number;
  unlocked_not_contacted: number;
  unlocks_30d: number;
  unlock_cents_30d: number;
}

function Tile({ label, value, hint, tone = "neutral" }: { label: string; value: string | number; hint: string; tone?: "neutral" | "bad" | "warn" }) {
  const ring = tone === "bad" ? "border-red-300 bg-red-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${ring}`}>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{hint}</p>
    </div>
  );
}

/** What is stuck in the request flow right now. A tile turns red or amber when something needs a person. */
export function FlowHealth({ showLink = true }: { showLink?: boolean }) {
  const q = useLiveQuery<Health | null>(null, () => getSupabaseBrowser().rpc("admin_flow_health"), { key: "flow-health", intervalMs: 30_000 });
  const h = q.data;

  if (q.error) {
    return <p className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">The request flow health could not be loaded. Run <code>supabase/schema-flow.sql</code> in the Supabase SQL Editor.</p>;
  }
  if (!h) return null;
  const clear = h.unmatched === 0 && h.alerts_failed === 0 && h.alerts_waiting === 0 && h.unlocked_not_contacted === 0;

  return (
    <section aria-label="Request flow health" className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-navy">Request flow health <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${clear ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{clear ? "All clear" : "Needs a look"}</span></h2>
        {showLink && <Link to="/admin/logs" className="text-sm font-semibold text-primary hover:underline">Open the logs →</Link>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Tile label="Requests, last 24 hours" value={h.leads_24h} hint={`${h.leads_7d} in the last 7 days`} />
        <Tile label="Not sent to anyone" value={h.unmatched} hint="Older than 10 minutes, no business received it" tone={h.unmatched > 0 ? "bad" : "neutral"} />
        <Tile label="Alert emails failed" value={h.alerts_failed} hint="Check the Resend setup" tone={h.alerts_failed > 0 ? "bad" : "neutral"} />
        <Tile label="Alert emails waiting" value={h.alerts_waiting} hint="Queued for over 30 minutes" tone={h.alerts_waiting > 0 ? "warn" : "neutral"} />
        <Tile label="Unlocked, not contacted" value={h.unlocked_not_contacted} hint="Paid for 48 hours ago or more" tone={h.unlocked_not_contacted > 0 ? "warn" : "neutral"} />
        <Tile label="Unlocks, last 30 days" value={h.unlocks_30d} hint={`${money(h.unlock_cents_30d)} paid`} />
      </div>
    </section>
  );
}
