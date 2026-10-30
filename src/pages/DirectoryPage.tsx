import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ListingCard } from "@/components/directory/ListingCard";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { services } from "@/config/services";
import { breadcrumbLd, webPageLd } from "@/lib/schema";
import { usePublishedListings } from "@/lib/directory";
import { isFeatured } from "@/lib/plans";
import { usePageMeta } from "@/lib/use-page-meta";

export default function DirectoryPage() {
  usePageMeta({
    title: "HVAC Contractor Directory | Find Local Heating and AC Companies",
    description: "Browse independent HVAC contractors by location and service. Listings are provided by the businesses; confirm licensing and insurance directly.",
    path: "/directory",
    jsonLd: [
      { ...webPageLd("HVAC Contractor Directory", "Browse independent HVAC contractors by location and service.", "/directory"), "@type": "CollectionPage" },
      breadcrumbLd([{ name: "Home", path: "/" }, { name: "Directory", path: "/directory" }]),
    ],
  });
  const { data: listings, loading, error } = usePublishedListings();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const state = params.get("state") ?? "";
  const city = params.get("city") ?? "";
  const service = params.get("service") ?? "";
  const emergency = params.get("emergency") === "1";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "state") next.delete("city");
    setParams(next, { replace: true });
  };

  const states = useMemo(() => [...new Set(listings.map((l) => l.state))].sort(), [listings]);
  const cities = useMemo(
    () => [...new Set(listings.filter((l) => !state || l.state === state).map((l) => l.city))].sort(),
    [listings, state],
  );

  const term = q.trim().toLowerCase();
  const shown = listings.filter(
    (l) =>
      (!state || l.state === state) &&
      (!city || l.city === city) &&
      (!service || l.services.includes(service)) &&
      (!emergency || l.emergency_service) &&
      (!term || [l.business_name, l.city, l.state, l.description, l.service_areas, l.services.join(" ")].join(" ").toLowerCase().includes(term)),
  );

  return (
    <>
      <Header />
      <main className="bg-surface">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-site px-4 py-12 sm:px-6">
            <h1 className="text-4xl font-extrabold tracking-tight text-navy">HVAC Contractor Directory</h1>
            <p className="mt-3 max-w-2xl text-lg text-slate-600">
              Browse independent heating and cooling businesses by location and service. Listings are submitted by the businesses.
              We don&apos;t verify licensing, insurance or availability, so confirm these directly before hiring.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-site px-4 py-8 sm:px-6">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
              <label htmlFor="dir-q" className="sr-only">Search contractors</label>
              <input id="dir-q" value={q} onChange={(e) => set("q", e.target.value)} placeholder="Search by name, city or service…" className={`${inputClass} !pl-9`} />
            </div>
            <div>
              <label htmlFor="dir-state" className="sr-only">State</label>
              <select id="dir-state" value={state} onChange={(e) => set("state", e.target.value)} className={inputClass}>
                <option value="">All states</option>
                {states.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dir-city" className="sr-only">City</label>
              <select id="dir-city" value={city} onChange={(e) => set("city", e.target.value)} className={inputClass}>
                <option value="">All cities</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dir-service" className="sr-only">Service</label>
              <select id="dir-service" value={service} onChange={(e) => set("service", e.target.value)} className={inputClass}>
                <option value="">All services</option>
                {services.map((s) => <option key={s.id}>{s.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 lg:col-span-5">
              <input type="checkbox" checked={emergency} onChange={(e) => set("emergency", e.target.checked ? "1" : "")} className="size-4 accent-primary" />
              Only show businesses that say they offer emergency service
            </label>
          </form>

          <div role="status" aria-live="polite" className="mt-5 text-sm text-slate-600">
            {!loading && !error && `${shown.length} ${shown.length === 1 ? "business" : "businesses"} found`}
            {!loading && !error && shown.some(isFeatured) && <span className="ml-2 text-slate-500">Businesses marked Featured pay for placement.</span>}
          </div>

          <div className="mt-3">
            {error ? (
              <p className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-900">The directory couldn&apos;t be loaded right now. Please try again later.</p>
            ) : loading ? (
              <p className="text-slate-600">Loading…</p>
            ) : shown.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <p className="text-lg font-semibold text-navy">{listings.length === 0 ? "No businesses are listed yet." : "No businesses match your filters."}</p>
                <p className="mt-2 text-slate-600">Need help now? Tell us about your problem and we&apos;ll help you look for local options.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link to="/#lead-form" className={buttonClass("primary")}>Find HVAC Help</Link>
                  <Link to="/directory/add" className={buttonClass("secondary")}>List your business</Link>
                </div>
              </div>
            ) : (
              <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {shown.map((l) => <ListingCard key={l.id} listing={l} />)}
              </ul>
            )}
          </div>

          <aside className="mt-10 rounded-2xl bg-navy p-6 text-center">
            <p className="text-xl font-bold text-white">Are you an HVAC contractor?</p>
            <p className="mt-2 text-blue-100">Submit your business for review. Approved listings appear in the directory.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link to="/directory/add" className={buttonClass("accent")}>List your business</Link>
              <Link to="/pricing" className={buttonClass("secondary", "!border-white/30 !bg-transparent !text-white hover:!bg-white/10")}>See plans and pricing</Link>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
