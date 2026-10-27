import { Link } from "react-router-dom";
import { MapPin, Phone, Siren } from "lucide-react";
import type { Listing } from "@/lib/types";

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-navy">
        <Link to={`/directory/${listing.slug}`} className="hover:text-primary">{listing.business_name}</Link>
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
        <MapPin className="size-4 shrink-0" aria-hidden /> {listing.city}, {listing.state}
      </p>
      {listing.emergency_service && (
        <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-emergency-soft px-2.5 py-0.5 text-xs font-semibold text-emergency">
          <Siren className="size-3.5" aria-hidden /> Offers emergency service
        </p>
      )}
      {listing.description && <p className="mt-3 line-clamp-3 text-sm text-slate-700">{listing.description}</p>}
      {listing.services.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Services">
          {listing.services.slice(0, 4).map((s) => (
            <li key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">{s}</li>
          ))}
          {listing.services.length > 4 && <li className="px-1 text-xs text-slate-500">+{listing.services.length - 4} more</li>}
        </ul>
      )}
      <div className="mt-4 flex flex-1 items-end justify-between gap-3">
        <Link to={`/directory/${listing.slug}`} className="text-sm font-semibold text-primary">View details →</Link>
        {listing.phone && (
          <a href={telHref(listing.phone)} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy">
            <Phone className="size-4" aria-hidden /> {listing.phone}
          </a>
        )}
      </div>
    </li>
  );
}
