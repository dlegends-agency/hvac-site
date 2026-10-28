import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { locations } from "@/config/locations";
import { reveal } from "@/lib/reveal";

/** Map-style location marker used as decoration. */
function Pin({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 64" className={className}>
      <ellipse cx="24" cy="60" rx="11" ry="3.5" fill="#1a56db" opacity="0.18" />
      <path d="M24 2C12.4 2 3 11.2 3 22.6 3 38 24 58 24 58s21-20 21-35.4C45 11.2 35.6 2 24 2z" fill="#1a56db" />
      <path d="M24 2C12.4 2 3 11.2 3 22.6c0 3.6 1.2 7.4 3 11C9 20 15 9 36 6 32 3.4 28 2 24 2z" fill="#ffffff" opacity="0.18" />
      <circle cx="24" cy="22.5" r="8.5" fill="#ffffff" />
    </svg>
  );
}

const pill =
  "group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-blue-900/10";

export function ServiceAreaSection() {
  return (
    <section id="service-areas" aria-labelledby="areas-title" className="relative overflow-hidden bg-white py-14 sm:py-20">
      <div aria-hidden className="absolute inset-0 bg-[url('/images/map-bg.svg')] bg-cover bg-center" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
      <Pin className="anim-float absolute top-[22%] left-[6%] hidden w-8 drop-shadow-md md:block lg:left-[9%]" />
      <Pin className="anim-float absolute top-[42%] right-[5%] hidden w-14 drop-shadow-lg md:block lg:right-[8%]" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center" {...reveal()}>
          <h2 id="areas-title" className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Looking for HVAC Repair Near You?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
            Tell us where service is needed so we can help identify suitable local repair options.
          </p>
        </div>

        <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc, i) => (
            <li key={loc.slug} {...reveal(i)}>
              <Link to={loc.path} className={pill}>
                <MapPin className="size-5 shrink-0 fill-primary text-white" aria-hidden />
                <span className="flex-1 text-[13px] font-semibold text-navy">HVAC Contractors in {loc.name}</span>
                <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden />
              </Link>
            </li>
          ))}
          <li {...reveal(locations.length)}>
            <Link to="/directory" className={pill}>
              <MapPin className="size-5 shrink-0 fill-primary text-white" aria-hidden />
              <span className="flex-1 text-[13px] font-semibold text-navy">View More Locations</span>
              <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden />
            </Link>
          </li>
        </ul>

        <p className="mx-auto mt-5 max-w-2xl text-center text-xs text-slate-500">
          These are example locations. Contractor coverage has not been confirmed for any area, and availability varies.
        </p>
      </div>
    </section>
  );
}
