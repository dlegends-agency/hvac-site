import { useCallback, useEffect, useMemo, useState } from "react";
import { scoreBid } from "./bid-score";
import type { GovBid } from "./bids";
import { scorePermit, type Coverage } from "./permit-score";
import type { PublicPermit } from "./permits";
import { getSupabaseBrowser, isSupabaseConfigured } from "./supabase";
import type { Listing } from "./types";

export interface Opportunities {
  permits: PublicPermit[];
  bids: GovBid[];
  loading: boolean;
  /** Either list could not be loaded (the SQL has not been run, or the account is not a business owner). */
  error: boolean;
  /** Fetch both lists again (after a payment). */
  reload: () => void;
}

/** Both lead sources for a business owner: the HVAC building permits and open federal HVAC bids in their area. The database sends only what reaches their business and keeps phone and email back until they pay (my_permits and my_bids). */
export function useOpportunities(enabled = true): Opportunities {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<Opportunities, "reload">>({ permits: [], bids: [], loading: true, error: false });
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) return;
    let live = true;
    const supabase = getSupabaseBrowser();
    void (async () => {
      const [permits, bids] = await Promise.all([supabase.rpc("my_permits"), supabase.rpc("my_bids")]);
      if (live) setState({ permits: (permits.data as PublicPermit[] | null) ?? [], bids: (bids.data as GovBid[] | null) ?? [], loading: false, error: Boolean(permits.error || bids.error) });
    })();
    return () => {
      live = false;
    };
  }, [enabled, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

/** Where this business works: its own city and the places named in its service areas. Texas counts as partly in area. */
export function coverageForListing(listing: Pick<Listing, "city" | "service_areas"> | null): Coverage {
  const places = [listing?.city ?? "", ...(listing?.service_areas ?? "").split(/[,;\n]/)].map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { cities: new Set(places), stateCovered: true };
}

/** How many leads are worth a look today for this business: Hot permits and Hot bids in its area. */
export function useHotCounts(opps: Opportunities, cover: Coverage) {
  return useMemo(() => {
    const hotPermits = opps.permits.filter((p) => scorePermit(p, cover).tier === "hot").length;
    const hotBids = opps.bids.filter((b) => scoreBid(b, cover).tier === "hot").length;
    const closingSoon = opps.bids.filter((b) => {
      const s = scoreBid(b, cover);
      return s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 7;
    }).length;
    return { hotPermits, hotBids, closingSoon };
  }, [opps, cover]);
}
