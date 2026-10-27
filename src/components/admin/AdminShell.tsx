import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3, FileText, LayoutDashboard, Loader2, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/leads", label: "Leads", icon: Users },
  { href: "/admin/blog", label: "Blog", icon: FileText },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

type State = "loading" | "unconfigured" | "forbidden" | "ready";

/** Auth + admin guard and navigation. Real access control is enforced by RLS in Supabase. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState("");

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
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-6">
          <Link to="/" className="font-bold text-navy">Emergency HVAC Repair</Link>
          <p className="hidden truncate text-xs text-slate-500 lg:mt-1 lg:block">{email}</p>
          <button onClick={signOut} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-navy lg:hidden">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} to={href} aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-blue-50 text-primary" : "text-slate-700 hover:bg-slate-50"}`}>
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-3 pb-6 lg:absolute lg:bottom-0 lg:block lg:w-full">
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
