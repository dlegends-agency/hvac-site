import { Globe, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { HoursSection } from "@/components/directory/Hours";
import { telHref } from "@/components/directory/ListingCard";
import { safeUrl } from "@/lib/directory";
import type { Listing } from "@/lib/types";

/** What to search for on the map: the full address when there is one, otherwise the business name and town. */
export function mapQuery(l: Pick<Listing, "business_name" | "address" | "city" | "state" | "postal_code">): string {
  const place = [l.address, l.city, l.state, l.postal_code].filter(Boolean).join(", ");
  return l.address ? place : `${l.business_name}, ${place}`;
}

export const embedUrl = (query: string) => `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
export const directionsUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/**
 * Right-hand column of a listing page: a Google map, then the address, phone, website, email and opening hours.
 * It stays in view while the rest of the page scrolls (on wide screens).
 */
export function ListingSidebar({ listing: l }: { listing: Listing }) {
  const query = mapQuery(l);
  const website = safeUrl(l.website);
  const row = "flex items-start gap-3 text-sm text-slate-700";
  const icon = "mt-0.5 size-4 shrink-0 text-slate-500";
  return (
    <aside aria-label="Location and contact details" className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <iframe
          title={`Map showing ${l.business_name}`}
          src={embedUrl(query)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-56 w-full rounded-2xl border-0 bg-slate-100"
        />
        <ul className="mt-4 space-y-3">
          <li className={row}>
            <MapPin className={icon} aria-hidden />
            <span>
              {[l.address, `${l.city}, ${l.state}${l.postal_code ? ` ${l.postal_code}` : ""}`].filter(Boolean).join(", ")}
              <a href={directionsUrl(query)} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 font-semibold text-primary hover:underline">
                <Navigation className="size-3.5" aria-hidden /> Get directions
              </a>
            </span>
          </li>
          {l.phone && <li className={row}><Phone className={icon} aria-hidden /> <a href={telHref(l.phone)} className="font-medium text-navy hover:text-primary">{l.phone}</a></li>}
          {website && (
            <li className={row}>
              <Globe className={icon} aria-hidden />
              <a href={website} target="_blank" rel="nofollow ugc noopener noreferrer" className="break-all font-medium text-navy hover:text-primary">{website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>
            </li>
          )}
          {l.email && <li className={row}><Mail className={icon} aria-hidden /> <a href={`mailto:${l.email}`} className="break-all font-medium text-navy hover:text-primary">{l.email}</a></li>}
        </ul>
        <HoursSection listing={l} className="mt-5 border-t border-slate-100 pt-4" />
      </div>
    </aside>
  );
}
