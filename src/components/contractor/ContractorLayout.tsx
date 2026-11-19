import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookmarkCheck, ClipboardList, CreditCard, ExternalLink, LayoutDashboard, Loader2, LogOut, MessageSquare, Settings, Sparkles, ThumbsUp, UserCog, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { activePlan } from "@/lib/plans";
import { useContractorCounts } from "@/lib/use-contractor-counts";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import type { Listing, ListingBilling, ListingClaim } from "@/lib/types";
import { usePageMeta } from "@/lib/use-page-meta";
import { AssistantBubble } from "./AssistantBubble";
import { ContractorContext, type ContractorState } from "./context";

type BadgeKey = "newLeads" | "newOpportunities" | "messages";
interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  badge?: BadgeKey;
  /** Also the active item for these paths (the page it replaced, and where payments return). */
}

/** The menu, grouped by what you do there. A number on an item is something waiting for you. */
const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Work",
    items: [
      { href: "/contractor", label: "Dashboard", icon: LayoutDashboard },
      { href: "/contractor/leads", label: "Leads", icon: Users, badge: "newLeads" },
      { href: "/contractor/my-leads", label: "My Leads", icon: BookmarkCheck },
      { href: "/contractor/projects", label: "Projects & bids", icon: ClipboardList },
      { href: "/contractor/messages", label: "Messages", icon: MessageSquare, badge: "messages" },
    ],
  },
  {
    title: "My business",
    items: [
      { href: "/contractor/business", label: "Business profile", icon: UserCog },
      { href: "/contractor/recommendations", label: "Recommendations", icon: ThumbsUp },
      { href: "/contractor/billing", label: "Plan & billing", icon: CreditCard },
    ],
  },
  { title: "Account", items: [{ href: "/contractor/account", label: "Account settings", icon: Settings }] },
];

type Loaded = Omit<ContractorState, "reload">;

/** Sign-in guard, data loading and navigation for contractor accounts. Access to data is enforced by RLS in Supabase. */
export default function ContractorLayout() {
  usePageMeta({ title: "Contractor dashboard | HVACHelp", noindex: true });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState<Loaded | null>(null);
  const unread = useUnreadMessages().business;
  const counts = useContractorCounts(Boolean(state?.listing));

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return navigate("/contractor/login", { replace: true });

    const { data: owner } = await supabase.from("listing_owners").select("listing_id, notify_email").limit(1).maybeSingle();
    const ownerRow = owner as { listing_id: string; notify_email?: boolean } | null;
    const listingId = ownerRow?.listing_id;
    const [listing, billing, claims] = await Promise.all([
      listingId ? supabase.from("listings").select("*").eq("id", listingId).maybeSingle() : Promise.resolve({ data: null }),
      listingId ? supabase.from("listing_billing").select("*").eq("listing_id", listingId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("listing_claims").select("*").order("created_at", { ascending: false }).limit(1),
    ]);
    setState({
      email: user.email ?? "",
      notifyEmail: ownerRow?.notify_email ?? true,
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
        <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:pt-6 lg:pb-4">
            <Link to="/" aria-label="HVACHelp home"><Logo className="!h-8" /></Link>
            <button onClick={signOut} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-navy lg:hidden">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
          {value.listing && (
            <div className="mx-3 mb-3 hidden rounded-xl border border-slate-200 bg-slate-50 p-3 lg:block">
              <p className="truncate text-sm font-bold text-navy">{value.listing.business_name}</p>
              <p className="truncate text-xs text-slate-500">{value.email}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className={`rounded-full px-2 py-0.5 ${activePlan(value.listing) === "free" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-900"}`}>{activePlan(value.listing) === "free" ? "Free plan" : "Featured"}</span>
                <span className={`rounded-full px-2 py-0.5 ${value.listing.status === "published" ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800"}`}>{value.listing.status === "published" ? "Live" : value.listing.status}</span>
              </p>
            </div>
          )}
          <nav aria-label="Contractor" className="flex gap-3 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-5 lg:overflow-y-auto">
            {groups.map((g) => (
              <div key={g.title} className="flex shrink-0 gap-1 lg:flex-col">
                <p className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase lg:block">{g.title}</p>
                {g.items.map(({ href, label, icon: Icon, badge }) => {
                  const active = href === "/contractor" ? pathname === href : pathname.startsWith(href);
                  const n = badge === "messages" ? unread : badge ? counts[badge] : 0;
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
          {value.listing && activePlan(value.listing) === "free" && (
            <Link to="/contractor/billing" className="mx-3 mb-3 hidden items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700 hover:bg-amber-100 lg:flex">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <span><strong className="block text-navy">Go Featured</strong>Unlock leads for $5 instead of $10, and show more on your listing.</span>
            </Link>
          )}
          <div className="hidden border-t border-slate-100 px-3 py-3 lg:block">
            {value.listing?.status === "published" && (
              <Link to={`/directory/${value.listing.slug}`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ExternalLink className="size-4" aria-hidden /> View my listing
              </Link>
            )}
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10"><Outlet /></main>
        <AssistantBubble />
      </div>
    </ContractorContext.Provider>
  );
}
