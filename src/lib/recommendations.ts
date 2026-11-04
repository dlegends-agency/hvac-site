import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

/** An approved recommendation, as the public sees it (no email address). */
export interface Recommendation {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  featured: boolean;
  email_confirmed: boolean;
}

/**
 * Approved recommendations for a listing. `undefined` while loading, `null` when they are not available (the database script has
 * not been run yet), otherwise the list, newest first.
 */
export function useListingRecommendations(listingId: string | undefined): Recommendation[] | null | undefined {
  const [state, setState] = useState<{ id: string; list: Recommendation[] | null } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !listingId) return;
    let cancelled = false;
    getSupabaseBrowser()
      .from("listing_recommendations_public")
      .select("id, author_name, body, created_at, featured, email_confirmed")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!cancelled) setState({ id: listingId, list: error ? null : ((data as Recommendation[] | null) ?? []) });
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (!listingId || !isSupabaseConfigured) return undefined;
  return state?.id === listingId ? state.list : undefined;
}
