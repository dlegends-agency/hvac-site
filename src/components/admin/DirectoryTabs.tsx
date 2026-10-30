import { Link, useLocation } from "react-router-dom";

const tabs = [
  { to: "/admin/listings", label: "Listings" },
  { to: "/admin/listings/discover", label: "Find businesses" },
];

/** Tab bar shared by the directory admin pages. */
export function DirectoryTabs() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Directory sections" className="mb-6 flex gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.to === "/admin/listings/discover" ? pathname === t.to : pathname === "/admin/listings";
        return (
          <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
