import { Quote } from "lucide-react";
import { isFeatured } from "@/lib/plans";
import type { Recommendation } from "@/lib/recommendations";
import type { Listing } from "@/lib/types";

/**
 * The one recommendation a business has chosen to feature, shown above "About us". A paid-plan feature: a listing that is no longer
 * on a paid plan shows its recommendations only in the list lower down.
 */
export function FeaturedRecommendation({ listing, items }: { listing: Listing; items: Recommendation[] | null | undefined }) {
  const featured = isFeatured(listing) ? items?.find((r) => r.featured) : undefined;
  if (!featured) return null;
  return (
    <section aria-labelledby="featured-rec-heading" className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
      <h2 id="featured-rec-heading" className="flex items-center gap-2 text-sm font-semibold text-navy">
        <Quote className="size-4 text-primary" aria-hidden /> What customers are saying
      </h2>
      <blockquote className="mt-2 whitespace-pre-line leading-relaxed text-slate-800">{featured.body}</blockquote>
      <p className="mt-2 text-sm text-slate-600">
        <span className="font-semibold text-navy">{featured.author_name}</span> · {new Date(featured.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        {featured.email_confirmed && <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-600">Email confirmed</span>}
      </p>
      <a href="#recommendations" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">See all recommendations</a>
    </section>
  );
}
