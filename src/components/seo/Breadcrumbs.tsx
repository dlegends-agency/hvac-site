import { Link } from "react-router-dom";
import type { Crumb } from "@/lib/schema";

/** Visible breadcrumb trail. Pair with breadcrumbLd() in the page's JSON-LD. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="font-medium text-navy">{c.name}</span>
            ) : (
              <Link to={c.path} className="hover:text-primary hover:underline">{c.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
