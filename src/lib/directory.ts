import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { locations, type ServiceLocation } from "@/config/locations";
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

/** How many businesses a location page shows before linking to the full directory. */
export const LOCATION_PAGE_LIMIT = 6;

const norm = (s: string) => s.trim().toLowerCase();

const isLetter = (c: string | undefined) => Boolean(c) && (c as string).toLowerCase() !== (c as string).toUpperCase();

/** True when text names the place as a whole word (case-insensitive), e.g. "Austin" but not "Austinville". */
function mentionsPlace(text: string, place: string): boolean {
  const t = text.toLowerCase();
  const p = place.toLowerCase();
  for (let i = t.indexOf(p); i !== -1; i = t.indexOf(p, i + 1)) {
    if (!isLetter(t[i - 1]) && !isLetter(t[i + p.length])) return true;
  }
  return false;
}

/**
 * Businesses for a location page. A city page lists businesses in that city first, then businesses whose own stated
 * service area names the city. A state page lists businesses in the state, interleaved across cities so the sample is varied.
 */
export function listingsForLocation(all: Listing[], loc: ServiceLocation): Listing[] {
  if (loc.type === "state") {
    // Take businesses evenly from each city area so the statewide sample is varied.
    const lists = locations
      .filter((l) => l.type === "city" && norm(l.state) === norm(loc.name))
      .map((city) => listingsForLocation(all, city));
    const seen = new Set<string>();
    const out: Listing[] = [];
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
      for (const list of lists) {
        const item = list[i];
        if (item && !seen.has(item.id)) {
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    for (const l of all) if (norm(l.state) === norm(loc.name) && !seen.has(l.id)) out.push(l);
    return out;
  }
  const serves = (l: Listing) => Boolean(l.service_areas) && mentionsPlace(l.service_areas as string, loc.name);
  const sameState = all.filter((l) => norm(l.state) === norm(loc.state));
  const inCity = sameState.filter((l) => norm(l.city) === norm(loc.name));
  const servesCity = sameState.filter((l) => norm(l.city) !== norm(loc.name) && serves(l));
  return [...inCity, ...servesCity];
}
