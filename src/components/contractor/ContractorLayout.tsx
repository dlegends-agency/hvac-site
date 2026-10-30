import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CreditCard, ExternalLink, LayoutDashboard, Loader2, LogOut, UserCog, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import type { Listing, ListingBilling, ListingClaim } from "@/lib/types";
import { usePageMeta } from "@/lib/use-page-meta";
import { ContractorContext, type ContractorState } from "./context";

const links = [
  { href: "/contractor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contractor/leads", label: "Leads", icon: Users },
  { href: "/contractor/profile", label: "My profile", icon: UserCog },
  { href: "/contractor/billing", label: "Plan & billing", icon: CreditCard },
];

type Loaded = Omit<ContractorState, "reload">;

/** Sign-in guard, data loading and navigation for contractor accounts. Access to data is enforced by RLS in Supabase. */
export default function ContractorLayout() {
  usePageMeta({ title: "Contractor dashboard | HVACHelp", noindex: true });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState<Loaded | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return navigate("/contractor/login", { replace: true });

    const { data: owner } = await supabase.from("listing_owners").select("listing_id").limit(1).maybeSingle();
    const listingId = (owner as { listing_id: string } | null)?.listing_id;
    const [listing, billing, claims] = await Promise.all([
      listingId ? supabase.from("listings").select("*").eq("id", listingId).maybeSingle() : Promise.resolve({ data: null }),
      listingId ? supabase.from("listing_billing").select("*").eq("listing_id", listingId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("listing_claims").select("*").order("created_at", { ascending: false }).limit(1),
    ]);
    setState({
      email: user.email ?? "",
      listing: (listing.data as Listing | null) ?? null,
      billing: (billing.data as ListingBilling | null) ?? null,
      claim: ((claims.data as ListingClaim[] | null) ?? [])[0] ?? null,
    });
  }, [navigate]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const value = useMemo<ContractorState | null>(() => (state ? { ...state, reload: load } : null), [state, load]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    navigate("/contractor/login", { replace: true });
  }

  if (!isSupabaseConfigured) return <p className="p-8 text-slate-600">Accounts are not available yet (Supabase is not configured).</p>;
  if (!value) {
    return (
      <p className="flex items-center gap-2 p-8 text-slate-600">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }

  return (
    <ContractorContext.Provider value={value}>
      <div className="min-h-screen bg-surface lg:flex">
        <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-6">
            <Link to="/" aria-label="HVACHelp home"><Logo className="!h-8" /></Link>
            <p className="hidden truncate text-xs text-slate-500 lg:mt-1 lg:block">{value.email}</p>
            <button onClick={signOut} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-navy lg:hidden">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
          <nav aria-label="Contractor" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col">
            {links.map(({ href, label, icon: Icon }) => {
              const active = href === "/contractor" ? pathname === href : pathname.startsWith(href);
              return (
                <Link key={href} to={href} aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-blue-50 text-primary" : "text-slate-700 hover:bg-slate-50"}`}>
                  <Icon className="size-4" aria-hidden /> {label}
                </Link>
              );
            })}
            {value.listing?.status === "published" && (
              <Link to={`/directory/${value.listing.slug}`} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ExternalLink className="size-4" aria-hidden /> View my listing
              </Link>
            )}
          </nav>
          <div className="hidden px-3 pb-6 lg:absolute lg:bottom-0 lg:block lg:w-full">
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8"><Outlet /></main>
      </div>
    </ContractorContext.Provider>
  );
}
