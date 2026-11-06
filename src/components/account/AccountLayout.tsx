import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ClipboardList, Loader2, LogOut, MessageSquare, Settings } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Button, buttonClass } from "@/components/ui/Button";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { usePageMeta } from "@/lib/use-page-meta";
import type { AccountState } from "./account-context";

const tabs = [
  { href: "/account", label: "My requests", icon: ClipboardList },
  { href: "/account/messages", label: "Messages", icon: MessageSquare },
  { href: "/account/settings", label: "Account", icon: Settings },
];

/** The customer's own dashboard: sign-in guard, heading and tabs. The pages inside read the signed-in person from the outlet. */
export default function AccountLayout() {
  usePageMeta({ title: "My account | HVACHelp", noindex: true });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const unread = useUnreadMessages().customer;
  const [user, setUser] = useState<Omit<AccountState, "refresh"> | null | "unavailable">(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return setUser("unavailable");
    const { data } = await getSupabaseBrowser().auth.getUser();
    const u = data.user;
    if (!u) return navigate("/account/login", { replace: true });
    const meta = (u.user_metadata ?? {}) as { full_name?: string; phone?: string };
    setUser({ email: u.email ?? "", name: meta.full_name ?? "", phone: meta.phone ?? "" });
  }, [navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  const value = useMemo<AccountState | null>(() => (user && user !== "unavailable" ? { ...user, refresh: load } : null), [user, load]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    navigate("/account/login", { replace: true });
  }

  return (
    <>
      <Header />
      <main className="bg-surface py-12">
        <div className="mx-auto max-w-site px-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-navy">My account</h1>
              {value && <p className="mt-1 text-sm text-slate-600">Signed in as {value.name ? `${value.name} · ` : ""}{value.email}</p>}
            </div>
            <div className="flex gap-3">
              <Link to="/#request" className={buttonClass("primary", "!rounded-full !py-2 text-sm")}>New request</Link>
              {value && <Button variant="secondary" onClick={signOut} className="!rounded-full !py-2 text-sm"><LogOut className="size-4" aria-hidden /> Sign out</Button>}
            </div>
          </div>

          {value && (
            <nav aria-label="My account" className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
              {tabs.map(({ href, label, icon: Icon }) => {
                const active = href === "/account" ? pathname === href : pathname.startsWith(href);
                return (
                  <Link key={href} to={href} aria-current={active ? "page" : undefined}
                    className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
                    <Icon className="size-4" aria-hidden /> {label}
                    {href === "/account/messages" && unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white" aria-label={`${unread} unread`}>{unread}</span>}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="mt-8">
            {user === null && <p className="flex items-center gap-2 text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>}
            {user === "unavailable" && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">Accounts aren&apos;t available right now. Please try again later.</p>}
            {value && <Outlet context={value} />}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
