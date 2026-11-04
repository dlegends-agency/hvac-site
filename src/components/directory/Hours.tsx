import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { DAYS, cleanHours, formatTime, openStatus } from "@/lib/hours";
import { fetchGoogleLive, type LiveHours } from "@/lib/google-live";
import { useNow } from "@/lib/admin-hooks";
import { isFeatured } from "@/lib/plans";
import type { Listing } from "@/lib/types";

/** "Open now · closes 5:00 PM" for a listing that has its own hours, or null. */
export function OpenNow({ listing }: { listing: Listing }) {
  const now = useNow(60_000);
  const status = openStatus(listing.business_hours, listing.state, new Date(now));
  if (!status) return null;
  return (
    <p className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold ${status.open ? "text-green-700" : "text-slate-600"}`}>
      <Clock className="size-4" aria-hidden /> {status.text}
    </p>
  );
}

/**
 * Opening hours. The business's own hours are used when it entered them. Otherwise, a paid listing that is connected to Google
 * shows Google's hours, fetched live (Google's terms do not allow storing them).
 */
export function HoursSection({ listing, className = "mt-8" }: { listing: Listing; className?: string }) {
  const own = cleanHours(listing.business_hours);
  const useGoogle = !own && isFeatured(listing) && Boolean(listing.google_place_id);
  const [google, setGoogle] = useState<{ slug: string; hours: LiveHours | null } | null>(null);

  useEffect(() => {
    if (!useGoogle) return;
    let cancelled = false;
    fetchGoogleLive(listing.slug).then((g) => {
      if (!cancelled) setGoogle({ slug: listing.slug, hours: g.hours });
    });
    return () => {
      cancelled = true;
    };
  }, [useGoogle, listing.slug]);

  if (own) {
    return (
      <section className={className} aria-labelledby="hours-heading">
        <h2 id="hours-heading" className="text-base font-semibold text-navy">Hours</h2>
        <OpenNow listing={listing} />
        <dl className="mt-3 grid max-w-sm grid-cols-[7rem_1fr] gap-y-1 text-sm">
          {DAYS.map((d) => (
            <div key={d.key} className="contents">
              <dt className="text-slate-600">{d.label}</dt>
              <dd className="text-navy">{own[d.key] ? `${formatTime(own[d.key]!.open)} – ${formatTime(own[d.key]!.close)}` : "Closed"}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const live = google?.slug === listing.slug ? google.hours : null;
  if (!useGoogle || !live) return null;
  return (
    <section className={className} aria-labelledby="hours-heading">
      <h2 id="hours-heading" className="text-base font-semibold text-navy">Hours</h2>
      {live.openNow !== null && (
        <p className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold ${live.openNow ? "text-green-700" : "text-slate-600"}`}>
          <Clock className="size-4" aria-hidden /> {live.openNow ? "Open now" : "Closed now"}
        </p>
      )}
      <ul className="mt-3 max-w-sm space-y-1 text-sm text-navy">
        {live.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Hours from Google, shown live.</p>
    </section>
  );
}
