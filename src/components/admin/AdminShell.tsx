import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, BarChart3, Building2, ClipboardCheck, ExternalLink, FileText, Landmark, HardHat, MessageSquare, LayoutDashboard, Loader2, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { useAdminCounts } from "@/lib/use-admin-counts";

type BadgeKey = "newLeads" | "newMessages" | "directory";
interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  badge?: BadgeKey;
}

/** The menu, grouped by what you do there. A number on an item is work waiting for you. */
const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Run the business",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/leads", label: "Leads", icon: Users, badge: "newLeads" },
      { href: "/admin/messages", label: "Messages", icon: MessageSquare, badge: "newMessages" },
      { href: "/admin/listings", label: "Directory", icon: Building2, badge: "directory" },
    ],
  },
  {
    title: "Lead sources",
    items: [
      { href: "/admin/permits", label: "Permits", icon: HardHat },
      { href: "/admin/bids", label: "Government bids", icon: Landmark },
    ],
  },
  {
    title: "Grow",
    items: [
      { href: "/admin/blog", label: "Blog", icon: FileText },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/seo-audit", label: "SEO Audit", icon: ClipboardCheck },
    ],
  },
  { title: "System", items: [{ href: "/admin/logs", label: "Logs", icon: Activity }] },
];

type State = "loading" | "unconfigured" | "forbidden" | "ready";

/** Auth + admin guard and navigation. Real access control is enforced by RLS in Supabase. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");
  const counts = useAdminCounts();
  const badges: Record<BadgeKey, number> = { newLeads: counts.newLeads, newMessages: counts.newMessages, directory: counts.pendingListings + counts.pendingClaims };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time auth check
      setState("unconfigured");
      return;
    }
    const supabase = getSupabaseBrowser();
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return navigate("/admin/login", { replace: true });
      setEmail(user.email ?? "");
      const { data: row } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
      setState(row ? "ready" : "forbidden");
    })();
  }, [navigate]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    navigate("/admin/login", { replace: true });
  }

  if (state === "loading") {
    return (
      <p className="flex items-center gap-2 p-8 text-slate-600">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (state !== "ready") {
    return (
      <div className="mx-auto max-w-xl p-8">
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-900">
          {state === "unconfigured" ? (
            "Supabase is not configured. Add the environment variables and restart."
          ) : (
            <>
              <strong>{email}</strong> is signed in but is not an admin. Add the user to <code>admin_users</code> (see supabase/schema.sql).
              <div className="mt-3"><Button variant="secondary" onClick={signOut}>Sign out</Button></div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-6">
          <Link to="/" aria-label="HVACHelp home"><Logo className="!h-8" /></Link>
          <p className="hidden truncate text-xs text-slate-500 lg:mt-1 lg:block">{email}</p>
          <button onClick={signOut} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-navy lg:hidden">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
        <nav aria-label="Admin" className="flex gap-3 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-5 lg:overflow-y-auto">
          {groups.map((g) => (
            <div key={g.title} className="flex shrink-0 gap-1 lg:flex-col">
              <p className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase lg:block">{g.title}</p>
              {g.items.map(({ href, label, icon: Icon, badge }) => {
                const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
                const n = badge ? badges[badge] : 0;
                return (
                  <Link key={href} to={href} aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-blue-50 text-primary" : "text-slate-700 hover:bg-slate-50"}`}>
                    <Icon className="size-4" aria-hidden /> {label}
                    {n > 0 && <span className="ml-auto rounded-full bg-emergency px-1.5 py-0.5 text-[11px] leading-none font-bold text-white tabular-nums" aria-label={`${n} waiting`}>{n > 99 ? "99+" : n}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-slate-100 px-3 py-3 lg:block">
          <Link to="/" target="_blank" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink className="size-4" aria-hidden /> View site
          </Link>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10">{children}</main>
    </div>
  );
}
