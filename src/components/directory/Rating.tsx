import { Star } from "lucide-react";
import { safeUrl } from "@/lib/directory";
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

/**
 * Star rating the business reports from its own Google Business Profile. Shown only for paid plans, and always labeled as
 * business-reported (we do not verify it), so visitors are not misled.
 */
export function GoogleRating({ listing, detailed = false }: { listing: Listing; detailed?: boolean }) {
  const rating = listing.google_rating;
  if (!isFeatured(listing) || !rating) return null;
  const count = listing.google_review_count;
  const url = safeUrl(listing.google_reviews_url);
  const updated = listing.rating_updated_at ? new Date(listing.rating_updated_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;
  const full = Math.round(rating);
  return (
    <div className="mt-2 text-sm text-slate-700">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span className="flex" role="img" aria-label={`${rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-4 ${n <= full ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />)}
        </span>
        <span className="font-semibold text-navy">{rating.toFixed(1)}</span>
        {count != null && <span>({count.toLocaleString()} Google reviews)</span>}
        {url && <a href={url} target="_blank" rel="noopener nofollow" className="font-medium text-primary hover:underline">See reviews</a>}
      </p>
      {detailed && <p className="mt-0.5 text-xs text-slate-500">Rating reported by the business{updated ? `, updated ${updated}` : ""}. Not verified by us.</p>}
    </div>
  );
}
