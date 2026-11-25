import { Link, useLocation } from "react-router-dom";
import { useAdminCounts } from "@/lib/use-admin-counts";

const tabs: { to: string; label: string; badge?: "listings" | "claims" }[] = [
  { to: "/admin/listings", label: "Listings", badge: "listings" },
  { to: "/admin/listings/discover", label: "Find businesses" },
  { to: "/admin/listings/vendors", label: "Government vendors" },
  { to: "/admin/listings/claims", label: "Claims", badge: "claims" },
  { to: "/admin/listings/recommendations", label: "Recommendations" },
];

/** Tab bar shared by the directory admin pages. */
export function DirectoryTabs() {
  const { pathname } = useLocation();
  const counts = useAdminCounts();
  const waiting = { listings: counts.pendingListings, claims: counts.pendingClaims };
  return (
    <nav aria-label="Directory sections" className="mb-6 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label}
            {t.badge && waiting[t.badge] > 0 && <span className="ml-2 rounded-full bg-emergency px-1.5 py-0.5 text-[11px] leading-none font-bold text-white tabular-nums">{waiting[t.badge]}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
