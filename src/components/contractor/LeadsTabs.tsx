import { Link, useLocation } from "react-router-dom";

const TABS = [
  { to: "/contractor/leads", label: "Find leads" },
  { to: "/contractor/my-leads", label: "Saved" },
  { to: "/contractor/projects", label: "Projects & bids" },
] as const;

/**
 * The three steps of working a lead, as tabs at the top of each page: find it, save it while you decide, then run it as a project or bid.
 * The menu has one "Leads" item for all three, so a contractor never has to work out which page holds what.
 */
export function LeadsTabs({ saved, projects }: { saved?: number; projects?: number }) {
  const { pathname } = useLocation();
  const counts: Record<string, number | undefined> = { "/contractor/my-leads": saved, "/contractor/projects": projects };
  return (
    <nav aria-label="Leads" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.to;
        const n = counts[t.to];
        return (
          <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label}{n !== undefined && n > 0 && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-blue-100 text-primary" : "bg-slate-100 text-slate-600"}`}>{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
