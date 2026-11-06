import { useLiveQuery } from "@/lib/admin-hooks";
import { TONE_CLASS, eventInfo } from "@/lib/flow";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Panel } from "./widgets";

interface Row {
  id: number;
  created_at: string;
  kind: string;
  detail: string | null;
  listings: { business_name: string } | null;
}

/** Everything that happened to one request, oldest first. */
export function LeadTimeline({ leadId }: { leadId: string }) {
  const q = useLiveQuery<Row[]>(
    [],
    () => getSupabaseBrowser().from("lead_events").select("id, created_at, kind, detail, listings(business_name)").eq("lead_id", leadId).order("id"),
    { key: `timeline-${leadId}`, intervalMs: 20_000 },
  );

  return (
    <Panel title="Timeline">
      {q.error ? (
        <p className="text-sm text-slate-500">The timeline is not set up yet (run <code>supabase/schema-flow.sql</code>).</p>
      ) : q.data.length === 0 ? (
        <p className="text-sm text-slate-500">No steps recorded.</p>
      ) : (
        <ol className="space-y-3 border-l border-slate-200 pl-4">
          {q.data.map((e) => {
            const info = eventInfo(e.kind);
            return (
              <li key={e.id} className="relative">
                <span className={`absolute -left-[1.4rem] top-1 size-2.5 rounded-full ring-2 ring-white ${e.kind === "alert_failed" || e.kind === "spam" ? "bg-red-500" : e.kind === "no_match" || e.kind === "unassigned" ? "bg-amber-500" : "bg-primary"}`} aria-hidden />
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[info.tone]}`}>{info.label}</span>
                  {e.listings && <span className="font-medium text-navy">{e.listings.business_name}</span>}
                </p>
                <p className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{e.detail ? ` · ${e.detail}` : ""}</p>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
