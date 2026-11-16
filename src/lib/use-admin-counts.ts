import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export interface AdminCounts {
  /** Customer requests nobody has looked at yet. */
  newLeads: number;
  /** Business registrations waiting for review. */
  pendingListings: number;
  /** Ownership claims waiting for review. */
  pendingClaims: number;
  permits: number;
  bids: number;
  /** When each lead source was last imported (ISO), or null when it has no rows. */
  permitsAt: string | null;
  bidsAt: string | null;
}

const EMPTY: AdminCounts = { newLeads: 0, pendingListings: 0, pendingClaims: 0, permits: 0, bids: 0, permitsAt: null, bidsAt: null };

/** Small numbers the admin menu and overview show: what needs attention and how the lead sources are doing. A table that is not set up yet counts as 0. */
export function useAdminCounts(intervalMs = 60_000): AdminCounts {
  const [counts, setCounts] = useState<AdminCounts>(EMPTY);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    const sb = getSupabaseBrowser();
    const count = async (table: string, column?: string, value?: string) => {
      let q = sb.from(table).select("id", { count: "exact", head: true });
      if (column && value) q = q.eq(column, value);
      const { count: n, error } = await q;
      return error ? 0 : (n ?? 0);
    };
    const latest = async (table: string) => {
      const { data, error } = await sb.from(table).select("imported_at").order("imported_at", { ascending: false }).limit(1);
      return error || !data?.length ? null : (data[0] as { imported_at: string }).imported_at;
    };
    const load = async () => {
      const [newLeads, pendingListings, pendingClaims, permits, bids, permitsAt, bidsAt] = await Promise.all([
        count("leads", "status", "new"),
        count("listings", "status", "pending"),
        count("listing_claims", "status", "pending"),
        count("public_permits", "trade", "HVAC"),
        count("gov_bids"),
        latest("public_permits"),
        latest("gov_bids"),
      ]);
      if (live) setCounts({ newLeads, pendingListings, pendingClaims, permits, bids, permitsAt, bidsAt });
    };
    void load();
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, intervalMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return counts;
}
