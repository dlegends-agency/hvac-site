import { useCallback, useRef } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export type ListingEvent = "impression" | "view" | "call" | "email" | "website" | "directions";
export type Placement = "directory" | "city" | "home" | "similar" | "listing" | "other";

/** How many pages this visit has opened. The first one is the one an outside link brought the visitor to. */
let pages = 0;
export const noteRoute = () => { pages += 1; };

function visitorId(): string {
  try {
    let id = localStorage.getItem("hvac_sid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hvac_sid", id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Where the visitor came from: the outside site on the first page, "On this site" after that. */
function source(): string | null {
  if (pages > 1) return "On this site";
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    return host && host !== location.hostname ? host : null;
  } catch {
    return null;
  }
}

const sent = new Set<string>();

/**
 * Counts one thing a visitor did with a business listing: it was shown in a list, opened, or its phone, email, website or directions were
 * tapped. Privacy-light, like the page counter: a random per-browser id, device class and referrer host only. Skipped for browsers that send
 * Do Not Track and inside the admin and contractor areas. The database drops repeats and the business's own owners.
 */
export function trackListing(slug: string, event: ListingEvent, placement: Placement = "other") {
  if (!isSupabaseConfigured || !slug || navigator.doNotTrack === "1" || /^\/(admin|contractor)/.test(location.pathname)) return;
  const id = visitorId();
  if (!id) return;
  if (event === "impression" || event === "view") {
    const k = `${event}:${placement}:${slug}`;
    if (sent.has(k)) return;
    sent.add(k);
  }
  const w = window.innerWidth;
  void getSupabaseBrowser()
    .rpc("track_listing_event", { p_slug: slug, p_event: event, p_session: id, p_device: w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop", p_ref: event === "view" ? source() : null, p_placement: placement })
    .then(() => {}, () => {});
}

/** Attach the returned ref to a listing card: when at least half of it has been on screen, one impression is counted. */
export function useImpression(slug: string, placement: Placement) {
  const seen = useRef<IntersectionObserver | null>(null);
  return useCallback((el: HTMLElement | null) => {
    seen.current?.disconnect();
    seen.current = null;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        trackListing(slug, "impression", placement);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    seen.current = io;
  }, [slug, placement]);
}
