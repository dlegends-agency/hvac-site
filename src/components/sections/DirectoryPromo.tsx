import { Link } from "react-router-dom";
import { Building2, Search } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

export function DirectoryPromo() {
  return (
    <section aria-labelledby="directory-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-surface p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-primary" aria-hidden><Search className="size-6" /></span>
          <h2 id="directory-title" className="mt-4 text-2xl font-bold text-navy">Browse the HVAC Contractor Directory</h2>
          <p className="mt-2 text-slate-600">
            Search independent heating and cooling businesses by location and service, and contact them directly.
            Listings are provided by the businesses, so confirm licensing and insurance before you hire.
          </p>
          <Link to="/directory" className={buttonClass("primary", "mt-5")}>Browse the directory</Link>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-surface p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-emergency-soft text-emergency" aria-hidden><Building2 className="size-6" /></span>
          <h2 className="mt-4 text-2xl font-bold text-navy">Are You an HVAC Contractor?</h2>
          <p className="mt-2 text-slate-600">
            Submit your business for review. Approved listings appear in the directory. A listing isn&apos;t a guarantee of placement, calls or leads.
          </p>
          <Link to="/directory/add" className={buttonClass("secondary", "mt-5")}>List your business</Link>
        </div>
      </div>
    </section>
  );
}
