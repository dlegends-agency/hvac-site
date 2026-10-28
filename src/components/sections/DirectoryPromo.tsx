import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

export function DirectoryPromo() {
  return (
    <section aria-labelledby="directory-title" className="bg-white py-12 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-2">
        <div className="relative flex items-center gap-5 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm sm:p-8">
          <div aria-hidden className="relative hidden size-28 shrink-0 place-items-center sm:grid">
            <span className="absolute size-28 rounded-full border border-sky-200" />
            <span className="absolute size-20 rounded-full border border-sky-200 bg-sky-100/60" />
            <MapPin className="relative size-10 fill-primary text-white" />
          </div>
          <div>
            <h2 id="directory-title" className="text-xl font-extrabold text-navy sm:text-2xl">Browse the HVAC Contractor Directory</h2>
            <p className="mt-2 text-sm text-slate-600">
              Search independent heating and cooling businesses by location and service, and contact them directly. Listings are provided by the businesses.
            </p>
            <Link to="/directory" className={buttonClass("primary", "mt-4 !rounded-full !px-5 !py-2.5 text-sm")}>Browse the directory <ArrowRight className="size-4" aria-hidden /></Link>
          </div>
        </div>

        <div className="relative flex items-center gap-5 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 to-white shadow-sm">
          <img src="/images/dir-van.jpg" alt="Technician standing in front of a service van" width={528} height={440} loading="lazy" decoding="async"
            className="hidden h-full min-h-48 w-44 shrink-0 object-cover object-[30%_20%] sm:block" />
          <div className="p-6 sm:py-8 sm:pr-8 sm:pl-0">
            <h2 className="text-xl font-extrabold text-navy sm:text-2xl">Are You an HVAC Contractor?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Submit your business for review. Approved listings appear in the directory. A listing isn&apos;t a guarantee of placement, calls or leads.
            </p>
            <Link to="/directory/add" className={buttonClass("secondary", "mt-4 !rounded-full !px-5 !py-2.5 text-sm !border-primary !text-primary")}>
              List your business <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
