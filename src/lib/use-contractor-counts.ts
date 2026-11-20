import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export interface ContractorCounts {
  /** Customer requests sent to this business that nobody has contacted yet. */
  newLeads: number;
  /** Unlocked requests nobody has contacted yet: the number on My Leads. */
  newUnlocked: number;
  /** Requests whose phone and email are still locked. */
  lockedLeads: number;
  /** Permits and bids in this business's area that were added in the last day and a half. */
  newOpportunities: number;
  /** Everything in this business's area right now. */
  opportunities: number;
  ready: boolean;
}

const EMPTY: ContractorCounts = { newLeads: 0, newUnlocked: 0, lockedLeads: 0, newOpportunities: 0, opportunities: 0, ready: false };

/** The small numbers shown in the contractor menu and on the dashboard. Every list comes from the same database functions as its page. */
export function useContractorCounts(enabled: boolean, intervalMs = 300_000): ContractorCounts {
  const [counts, setCounts] = useState<ContractorCounts>(EMPTY);
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    let live = true;
    const sb = getSupabaseBrowser();
    const load = async () => {
      const [leads, permits, bids] = await Promise.all([sb.rpc("my_leads"), sb.rpc("my_permits"), sb.rpc("my_bids")]);
      if (!live) return;
      const l = ((leads.data as { contractor_status: string; unlocked: boolean }[] | null) ?? []);
      const items = [...((permits.data as { imported_at: string }[] | null) ?? []), ...((bids.data as { imported_at: string }[] | null) ?? [])];
      const since = Date.now() - 36 * 3_600_000;
      setCounts({
        newLeads: l.filter((x) => x.contractor_status === "new").length,
        newUnlocked: l.filter((x) => x.contractor_status === "new" && x.unlocked).length,
        lockedLeads: l.filter((x) => !x.unlocked).length,
        newOpportunities: items.filter((x) => new Date(x.imported_at).getTime() >= since).length,
        opportunities: items.length,
        ready: true,
      });
    };
    void load();
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, intervalMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
  return counts;
}
