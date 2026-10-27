import Link from "next/link";
import { MapPin } from "lucide-react";
import { locations, locationPagesPublished } from "@/config/locations";
import { OpenFormButton } from "@/components/OpenFormButton";
import { SectionHeading } from "./SectionHeading";

export function ServiceAreaSection() {
  const cardClass = "flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
  return (
    <section id="service-areas" aria-labelledby="areas-title" className="bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="areas-title" title="Looking for HVAC Repair Near You?"
          text="Tell us where service is needed so we can help identify suitable local repair options." />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => {
            const body = (
              <>
                <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="font-semibold text-navy">
                  {loc.type === "city" ? `${loc.name}, ${loc.state}` : loc.name}
                </span>
              </>
            );
            return (
              <li key={loc.slug}>
                {locationPagesPublished ? (
                  <Link href={loc.path} className={`${cardClass} hover:border-primary`}>{body}</Link>
                ) : (
                  <div className={cardClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-600">
          These are example locations. Contractor coverage has not been confirmed for any area, and availability varies.
        </p>
        <div className="mt-6 flex justify-center">
          <OpenFormButton>Enter Your Location</OpenFormButton>
        </div>
      </div>
    </section>
  );
}
