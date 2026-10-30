import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { safeGoogleUrl } from "@/lib/directory";
import { isFeatured } from "@/lib/plans";
import type { Listing } from "@/lib/types";

export function FeaturedBadge({ listing }: { listing: Listing }) {
  if (!isFeatured(listing)) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900" title="Featured listings are paid placements">
      <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden /> Featured
    </span>
  );
}

/** Google's own page for the connected business (used when the live rating isn't available). */
const mapsUrl = (placeId: string) => `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;

/** Fallback link to the business's Google reviews. Paid listings connected to Google only. */
function ReviewsLink({ listing }: { listing: Listing }) {
  if (!isFeatured(listing) || !listing.google_place_id) return null;
  return (
    <a href={mapsUrl(listing.google_place_id)} target="_blank" rel="noopener nofollow" className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> See reviews on Google
    </a>
  );
}

interface LiveRating {
  rating: number;
  count: number;
  url: string | null;
}

/**
 * Live Google star rating and review count for a paid listing connected to Google. Our server asks Google when this is
 * shown (Google's terms do not allow storing ratings). On directory cards the request waits until the card is on screen,
 * so a long list does not call Google for cards nobody scrolls to. If the rating isn't available we show the plain reviews link.
 */
export function GoogleReviews({ listing, compact = false }: { listing: Listing; compact?: boolean }) {
  const wanted = isFeatured(listing) && Boolean(listing.google_place_id);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!compact);
  const [live, setLive] = useState<{ slug: string; data: LiveRating | null } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!wanted || visible || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- old browsers: just load it
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [wanted, visible]);

  useEffect(() => {
    if (!wanted || !visible) return;
    let cancelled = false;
    fetch(`/api/google/rating?slug=${encodeURIComponent(listing.slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rating?: LiveRating | null } | null) => {
        if (!cancelled) setLive({ slug: listing.slug, data: j?.rating ?? null });
      })
      .catch(() => {
        if (!cancelled) setLive({ slug: listing.slug, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, visible, listing.slug]);

  if (!wanted) return null;
  const data = live?.slug === listing.slug ? live.data : null;
  // Show nothing while waiting for Google (no flash of the fallback); the link appears only if Google could not answer.
  if (!data) return <div ref={box}>{live?.slug === listing.slug ? <ReviewsLink listing={listing} /> : null}</div>;

  const url = safeGoogleUrl(data.url) ?? mapsUrl(listing.google_place_id as string);
  const star = compact ? "size-4" : "size-5";
  return (
    <div ref={box} className="mt-2">
      <a href={url} target="_blank" rel="noopener nofollow" className="inline-flex flex-wrap items-center gap-x-1.5 text-sm hover:underline" aria-label={`${data.rating.toFixed(1)} out of 5 stars from ${data.count.toLocaleString()} Google reviews`}>
        <span className="flex" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`${star} ${n <= Math.round(data.rating) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}
        </span>
        <span className="font-semibold text-navy">{data.rating.toFixed(1)}</span>
        <span className="text-slate-700">({data.count.toLocaleString()}{compact ? "" : " Google reviews"})</span>
      </a>
      <p className="mt-0.5 text-xs text-slate-500">{compact ? "Google reviews, shown live" : "Rating and reviews from Google, shown live."}</p>
    </div>
  );
}
