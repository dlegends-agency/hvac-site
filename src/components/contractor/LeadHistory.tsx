import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { CONTRACTOR_EVENTS } from "@/lib/flow";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Row {
  created_at: string;
  kind: string;
  detail: string | null;
}

/** The steps of one request for this business, loaded when opened. Never shows other businesses or the customer's details. */
export function LeadHistory({ leadId }: { leadId: string }) {
  const [state, setState] = useState<"closed" | "loading" | "error" | Row[]>("closed");

  async function toggle() {
    if (state !== "closed") return setState("closed");
    setState("loading");
    const { data, error } = await getSupabaseBrowser().rpc("my_lead_events", { p_lead: leadId });
    setState(error ? "error" : ((data as Row[] | null) ?? []));
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={toggle} aria-expanded={state !== "closed"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        {state === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <History className="size-4" aria-hidden />} {state === "closed" ? "History" : "Hide history"}
      </button>
      {state === "error" && <p className="mt-2 text-sm text-slate-500">The history is not available yet.</p>}
      {Array.isArray(state) && (
        state.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p> : (
          <ol className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 text-sm">
            {state.map((e, i) => (
              <li key={`${e.kind}-${i}`}>
                <span className="font-medium text-navy">{CONTRACTOR_EVENTS[e.kind] ?? e.kind}</span>
                <span className="ml-2 text-xs text-slate-500">{new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{e.kind === "unlocked" && e.detail ? ` · ${e.detail}` : ""}</span>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}
