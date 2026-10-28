import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { locations } from "@/config/locations";
import { reveal } from "@/lib/reveal";
import { OpenFormButton } from "@/components/OpenFormButton";
import { SectionHeading } from "./SectionHeading";

export function ServiceAreaSection() {
  return (
    <section id="service-areas" aria-labelledby="areas-title" className="relative overflow-hidden bg-gradient-to-b from-sky-50/70 to-white py-16 sm:py-20">
      <MapPin aria-hidden className="absolute top-10 left-[6%] hidden size-7 fill-primary text-white md:block" />
      <MapPin aria-hidden className="absolute right-[6%] bottom-16 hidden size-9 fill-primary text-white md:block" />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeading id="areas-title" title="Looking for HVAC Repair Near You?"
          text="Tell us where service is needed so we can help identify suitable local repair options." />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc, i) => (
            <li key={loc.slug} {...reveal(i)}>
              <Link to={loc.path} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:-translate-y-0.5 hover:border-primary hover:shadow-lg">
                <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex-1 font-semibold text-navy">
                  HVAC Contractor {loc.name}
                  {loc.type === "city" && <span className="block text-xs font-normal text-slate-500">{loc.state}</span>}
                </span>
                <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-600">
          These are example locations. Contractor coverage has not been confirmed for any area, and availability varies.
        </p>
        <div className="mt-6 flex justify-center">
          <OpenFormButton className="!rounded-full">Enter Your Location</OpenFormButton>
        </div>
      </div>
    </section>
  );
}
