import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import type { Listing } from "@/lib/types";

export function usePublishedListings() {
  const [state, setState] = useState<{ data: Listing[]; loading: boolean; error: boolean }>({
    data: [],
    loading: isSupabaseConfigured,
    error: false,
  });
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSupabaseBrowser()
      .from("listings")
      .select("*")
      .eq("status", "published")
      .order("business_name")
      .then(({ data, error }) => setState({ data: (data as Listing[] | null) ?? [], loading: false, error: Boolean(error) }));
  }, []);
  return state;
}

export function usePublishedListing(slug: string | undefined) {
  const [state, setState] = useState<{ slug?: string; data: Listing | null; loading: boolean }>({ data: null, loading: true });
  useEffect(() => {
    if (!slug || !isSupabaseConfigured) return;
    let cancelled = false;
    getSupabaseBrowser()
      .from("listings")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setState({ slug, data: (data as Listing | null) ?? null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  const loading = isSupabaseConfigured && (state.loading || state.slug !== slug);
  return { data: loading ? null : state.data, loading };
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

/** Ensures a URL starts with http(s) so listing links can't carry javascript: URLs. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
