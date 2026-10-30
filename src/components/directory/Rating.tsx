import { useEffect, useState } from "react";
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

/** Link to the business's own Google reviews. Shown on paid listings only; we don't copy or display Google's ratings. */
export function GoogleReviewsLink({ listing }: { listing: Listing }) {
  const url = safeGoogleUrl(listing.google_reviews_url);
  if (!isFeatured(listing) || !url) return null;
  return (
    <a href={url} target="_blank" rel="noopener nofollow" className="mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
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
 * Live Google star rating and review count for a paid listing connected to Google. Fetched from our server (which asks Google
 * when the page is viewed, as Google's terms require). If it isn't available we fall back to the plain reviews link.
 */
export function GoogleReviews({ listing }: { listing: Listing }) {
  const [live, setLive] = useState<{ slug: string; data: LiveRating | null } | null>(null);
  const wanted = isFeatured(listing) && Boolean(listing.google_place_id);

  useEffect(() => {
    if (!wanted) return;
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
  }, [wanted, listing.slug]);

  const data = live?.slug === listing.slug ? live.data : null;
  if (!data) return <GoogleReviewsLink listing={listing} />;

  const url = safeGoogleUrl(data.url) ?? safeGoogleUrl(listing.google_reviews_url);
  const body = (
    <>
      <span className="flex" role="img" aria-label={`${data.rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-5 ${n <= Math.round(data.rating) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />)}
      </span>
      <span className="font-semibold text-navy">{data.rating.toFixed(1)}</span>
      <span className="text-slate-700">({data.count.toLocaleString()} Google reviews)</span>
    </>
  );
  return (
    <div className="mt-2">
      {url ? (
        <a href={url} target="_blank" rel="noopener nofollow" className="inline-flex flex-wrap items-center gap-x-2 text-sm hover:underline">{body}</a>
      ) : (
        <p className="inline-flex flex-wrap items-center gap-x-2 text-sm">{body}</p>
      )}
      <p className="mt-0.5 text-xs text-slate-500">Rating and reviews from Google, shown live.</p>
    </div>
  );
}
