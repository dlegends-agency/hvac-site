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
