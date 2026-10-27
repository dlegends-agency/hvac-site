import { Link } from "react-router-dom";
import { ListingCard } from "@/components/directory/ListingCard";
import { buttonClass } from "@/components/ui/Button";
import type { ServiceLocation } from "@/config/locations";
import { usePublishedListings } from "@/lib/directory";

/** Published directory businesses for a city (or whole state). Shows an honest empty state when there are none. */
export function CityListings({ location }: { location: ServiceLocation }) {
  const { data, loading, error } = usePublishedListings();
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const matches = data.filter((l) => (location.type === "city" ? eq(l.city, location.name) && eq(l.state, location.state) : eq(l.state, location.name)));

  if (loading) return <p className="text-slate-600">Loading businesses…</p>;
  if (error || matches.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="font-semibold text-navy">No businesses are listed for {location.name} yet.</p>
        <p className="mt-1 text-slate-600">Submit a service request and we&apos;ll help you look for options, or add your business to the directory if you&apos;re a contractor.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/directory" className={buttonClass("secondary", "!py-2")}>Browse the full directory</Link>
          <Link to="/directory/add" className={buttonClass("secondary", "!py-2")}>List your business</Link>
        </div>
      </div>
    );
  }
  return (
    <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {matches.map((l) => <ListingCard key={l.id} listing={l} />)}
    </ul>
  );
}
