import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ShieldCheck, Star } from "lucide-react";
import { safeGoogleUrl } from "@/lib/directory";
import { fetchGoogleLive, type LiveRating } from "@/lib/google-live";
import { isFeatured, isVerified } from "@/lib/plans";
import type { Listing } from "@/lib/types";

export function FeaturedBadge({ listing }: { listing: Listing }) {
  if (!isFeatured(listing)) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900" title="Featured listings are paid placements">
      <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden /> Featured
    </span>
  );
}

/** Paid plan and an approved owner. It says who runs the listing, not that we checked licensing, insurance or work quality. */
export function VerifiedBadge({ listing }: { listing: Listing }) {
  if (!isVerified(listing)) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900" title="HVACHelp confirmed that someone from this business manages this listing. This does not mean we checked licensing, insurance or work quality.">
      <BadgeCheck className="size-3.5 text-primary" aria-hidden /> Verified by HVACHelp
    </span>
  );
}

/** The license number the business gave us. "Verified" only after an admin checked it with the state. */
export function LicenseBadge({ listing }: { listing: Listing }) {
  const number = listing.license_number?.trim();
  if (!number) return null;
  const verified = Boolean(listing.license_verified_at);
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${verified ? "bg-green-50 text-green-900" : "bg-slate-100 text-slate-700"}`}
      title={verified ? "HVACHelp checked this license number with the state." : "The business gave us this license number. HVACHelp has not checked it yet."}
    >
      <ShieldCheck className={`size-3.5 ${verified ? "text-green-700" : "text-slate-500"}`} aria-hidden />
      {verified ? `License verified · ${number}` : `License no. provided · ${number}`}
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
    fetchGoogleLive(listing.slug).then((g) => {
      if (!cancelled) setLive({ slug: listing.slug, data: g.rating });
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
