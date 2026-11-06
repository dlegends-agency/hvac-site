import { Panel } from "@/components/admin/widgets";
import { useLiveQuery } from "@/lib/admin-hooks";
import { money, shortHours } from "@/lib/flow";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Perf {
  received: number;
  unlocked: number;
  contacted: number;
  won: number;
  lost: number;
  waiting_to_unlock: number;
  spent_cents: number;
  median_hours_to_contact: number | null;
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

/** How the business did on the requests it received in the last 30 days: a funnel from received to won, plus spend and speed. */
export function PerformancePanel() {
  const q = useLiveQuery<Perf | null>(null, () => getSupabaseBrowser().rpc("my_performance"), { key: "my-performance", intervalMs: 120_000 });
  const p = q.data;
  if (q.error || !p) return null;

  const steps = [
    { label: "Received", value: p.received, tone: "bg-slate-400" },
    { label: "Unlocked", value: p.unlocked, tone: "bg-blue-500" },
    { label: "Contacted", value: p.contacted, tone: "bg-amber-500" },
    { label: "Won", value: p.won, tone: "bg-green-600" },
  ];
  const top = Math.max(1, p.received);

  return (
    <Panel title="Your last 30 days">
      {p.received === 0 ? (
        <p className="text-sm text-slate-600">No requests in the last 30 days. Make sure your ZIP code, travel distance and service areas are set so nearby requests reach you.</p>
      ) : (
        <>
          <ul className="space-y-2" aria-label="From received to won">
            {steps.map((s) => (
              <li key={s.label} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="text-slate-700">{s.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${s.tone}`} style={{ width: `${(s.value / top) * 100}%` }} /></span>
                <span className="text-right font-semibold text-navy">{s.value}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Unlock rate</dt><dd className="font-semibold text-navy">{pct(p.unlocked, p.received)}</dd></div>
            <div><dt className="text-slate-500">Contacted, of unlocked</dt><dd className="font-semibold text-navy">{pct(p.contacted, p.unlocked)}</dd></div>
            <div><dt className="text-slate-500">Won, of unlocked</dt><dd className="font-semibold text-navy">{pct(p.won, p.unlocked)}</dd></div>
            <div><dt className="text-slate-500">Spent on unlocks</dt><dd className="font-semibold text-navy">{money(p.spent_cents)}</dd></div>
            <div><dt className="text-slate-500">Typical time to contact</dt><dd className="font-semibold text-navy">{shortHours(p.median_hours_to_contact)}</dd></div>
            <div><dt className="text-slate-500">Still locked</dt><dd className="font-semibold text-navy">{p.waiting_to_unlock}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">Marking a request as contacted, won or lost on the Leads page keeps these numbers accurate. Replying quickly usually helps.</p>
        </>
      )}
    </Panel>
  );
}
