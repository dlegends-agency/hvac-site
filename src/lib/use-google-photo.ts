import { useEffect, useState } from "react";
import { fetchGoogleLive } from "@/lib/google-live";
import { isFeatured } from "@/lib/plans";
import type { Listing } from "@/lib/types";

/**
 * The business's Google photo, for a paid listing connected to Google that has not uploaded its own profile picture. Our server asks
 * Google each time (Google's terms do not allow storing photos); `src` is an address on our site that redirects to Google's image.
 */
export function useGooglePhoto(listing: Listing | null | undefined, wanted: boolean): { src: string; attribution: string | null } | null {
  const slug = listing?.slug;
  const eligible = wanted && Boolean(listing) && isFeatured(listing as Listing) && Boolean(listing?.google_place_id);
  const [state, setState] = useState<{ slug: string; photo: { name: string; attribution: string | null } | null } | null>(null);

  useEffect(() => {
    if (!eligible || !slug) return;
    let cancelled = false;
    fetchGoogleLive(slug).then((g) => {
      if (!cancelled) setState({ slug, photo: g.photo });
    });
    return () => {
      cancelled = true;
    };
  }, [eligible, slug]);

  if (!eligible || !slug || state?.slug !== slug || !state.photo) return null;
  return { src: `/api/google/photo?slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(state.photo.name)}`, attribution: state.photo.attribution };
}
