import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { ContractorLead } from "@/lib/types";

/** Leads sent to the signed-in contractor's listing (from the my_leads() database function). */
export function useMyLeads(enabled: boolean) {
  const [state, setState] = useState<{ leads: ContractorLead[] | null; error: boolean }>({ leads: null, error: false });

  const reload = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser().rpc("my_leads");
    setState({ leads: (data as ContractorLead[] | null) ?? [], error: Boolean(error) });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [enabled, reload]);

  const replace = useCallback(
    (updated: ContractorLead) => setState((s) => ({ ...s, leads: s.leads?.map((l) => (l.id === updated.id ? updated : l)) ?? null })),
    [],
  );

  return { ...state, reload, replace };
}

/** "5 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
