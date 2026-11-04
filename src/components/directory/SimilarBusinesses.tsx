import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LicenseBadge, VerifiedBadge } from "@/components/directory/Rating";
import { usePublishedListings } from "@/lib/directory";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import type { Listing } from "@/lib/types";

const LIMIT = 4;

/** Other published businesses in the same city (paid listings first), with how many recommendations each has. */
export function SimilarBusinesses({ listing }: { listing: Listing }) {
  const { data: all } = usePublishedListings();
  const similar = useMemo(
    () => all.filter((l) => l.id !== listing.id && l.city.trim().toLowerCase() === listing.city.trim().toLowerCase() && l.state.trim().toLowerCase() === listing.state.trim().toLowerCase()).slice(0, LIMIT),
    [all, listing.id, listing.city, listing.state],
  );
  const ids = similar.map((l) => l.id).join(",");
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isSupabaseConfigured || !ids) return;
    let cancelled = false;
    getSupabaseBrowser()
      .from("listing_recommendation_counts")
      .select("listing_id, total")
      .in("listing_id", ids.split(","))
      .then(({ data }) => {
        if (!cancelled) setCounts(Object.fromEntries(((data as { listing_id: string; total: number }[] | null) ?? []).map((r) => [r.listing_id, r.total])));
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (similar.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="similar-heading">
      <h2 id="similar-heading" className="text-lg font-semibold text-navy">Similar businesses in {listing.city}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {similar.map((l) => (
          <li key={l.id} className="rounded-2xl border border-slate-200 p-4">
            <Link to={`/directory/${l.slug}`} className="font-semibold text-navy hover:text-primary">{l.business_name}</Link>
            <p className="mt-0.5 text-sm text-slate-600">{l.city}, {l.state}{counts[l.id] ? ` · ${counts[l.id]} recommendation${counts[l.id] === 1 ? "" : "s"}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 empty:hidden">
              <VerifiedBadge listing={l} />
              <LicenseBadge listing={l} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
