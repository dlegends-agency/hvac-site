import { useMemo, useState } from "react";
import { FlowHealth } from "./FlowHealth";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Building2, Check, ExternalLink, EyeOff, HardHat, Inbox, Landmark, MessageSquare, Minus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { plans } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { useCountUp, useLiveQuery, useNow } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useAdminCounts } from "@/lib/use-admin-counts";
import { useScheduleText } from "@/lib/use-schedule";
import type { Lead, Listing, ListingBilling, ListingPrivate, ListingStatus, PageView } from "@/lib/types";
import { PageTitle, Panel, StatusBadge } from "./widgets";

const DAY = 86_400_000;
const RANGES = [7, 30, 90] as const;
const REFRESH_MS = 30_000;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0) return <span className="text-xs font-medium text-slate-500">{now > 0 ? "New activity" : "No data yet"}</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-500"><Minus className="size-3" aria-hidden /> No change</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-green-700" : "text-red-700"}`}>
      {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
      {Math.abs(pct)}% <span className="font-normal text-slate-500">vs previous</span>
    </span>
  );
}

function Kpi({ label, value, suffix = "", prev, tone = "blue", children }: {
  label: string; value: number; suffix?: string; prev?: number; tone?: "blue" | "green"; children?: React.ReactNode;
}) {
  const shown = useCountUp(value);
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${tone === "green" ? "border-green-200" : "border-slate-200"}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone === "green" ? "text-green-700" : "text-navy"}`}>{shown.toLocaleString()}{suffix}</p>
      <div className="mt-1 min-h-5">{prev !== undefined ? <Delta now={value} prev={prev} /> : children}</div>
    </div>
  );
}

/**
 * The admin's home: what needs a person right now, four numbers, money, and the newest leads. Traffic charts live on the Analytics page,
 * and the full lists on Leads and Directory.
 */
export function OverviewDashboard() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [busyId, setBusyId] = useState<string | null>(null);
  const attention = useAdminCounts(REFRESH_MS);
  const permitsSchedule = useScheduleText("permits");
  const bidsSchedule = useScheduleText("bids");
  const supabase = getSupabaseBrowser();
  const intervalMs = REFRESH_MS;

  const leadsQ = useLiveQuery<Lead[]>([], () => supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000), { key: "leads", intervalMs });
  const viewsQ = useLiveQuery<PageView[]>(
    [],
    () =>
      supabase
        .from("page_views")
        .select("created_at,session_id")
        .gte("created_at", new Date(Date.now() - days * 2 * DAY).toISOString())
        .order("created_at", { ascending: false })
        .limit(20000),
    { key: `views-${days}`, intervalMs },
  );
  const listingsQ = useLiveQuery<Listing[]>([], () => supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(500), { key: "listings", intervalMs });
  const billingQ = useLiveQuery<ListingBilling[]>([], () => supabase.from("listing_billing").select("*"), { key: "billing", intervalMs });
  const privateQ = useLiveQuery<ListingPrivate[]>([], () => supabase.from("listing_private").select("*"), { key: "private", intervalMs });
  const unlocksQ = useLiveQuery<{ unlocked_at: string; unlock_cents: number | null }[]>(
    [],
    () => supabase.from("lead_assignments").select("unlocked_at, unlock_cents").not("unlocked_at", "is", null).order("unlocked_at", { ascending: false }).limit(2000),
    { key: "unlocks", intervalMs },
  );

  const [listingOverrides, setListingOverrides] = useState<Record<string, ListingStatus>>({});
  const listings = useMemo(() => listingsQ.data.map((l) => ({ ...l, status: listingOverrides[l.id] ?? l.status })), [listingsQ.data, listingOverrides]);

  const failed = leadsQ.error || viewsQ.error || listingsQ.error;
  const now = useNow(1000);
  const lastMs = Math.max(0, leadsQ.updatedAt?.getTime() ?? 0, viewsQ.updatedAt?.getTime() ?? 0, listingsQ.updatedAt?.getTime() ?? 0);
  const updatedAt = lastMs || null;
  const asOf = lastMs || now;

  const stats = useMemo(() => {
    const cutoff = asOf - days * DAY;
    const cur = viewsQ.data.filter((v) => new Date(v.created_at).getTime() >= cutoff);
    const prev = viewsQ.data.filter((v) => new Date(v.created_at).getTime() < cutoff);
    const sessions = (list: PageView[]) => new Set(list.map((v) => v.session_id).filter(Boolean)).size;
    const realLeads = leadsQ.data.filter((l) => l.status !== "spam");
    const curLeads = realLeads.filter((l) => new Date(l.created_at).getTime() >= cutoff);
    const prevLeads = realLeads.filter((l) => new Date(l.created_at).getTime() < cutoff && new Date(l.created_at).getTime() >= cutoff - days * DAY);
    const visitors = sessions(cur);
    return { visitors, prevVisitors: sessions(prev), curLeads, prevLeads, conversion: visitors ? Math.round((curLeads.length / visitors) * 1000) / 10 : 0 };
  }, [viewsQ.data, leadsQ.data, days, asOf]);

  const privateById = useMemo(() => new Map(privateQ.data.map((p) => [p.listing_id, p])), [privateQ.data]);
  const pending = useMemo(() => listings.filter((l) => l.status === "pending"), [listings]);

  // Businesses on a paid plan right now (a plan only counts until its paid-until date).
  const paying = useMemo(() => {
    const billingById = new Map(billingQ.data.map((b) => [b.listing_id, b]));
    const rows = listings
      .filter((l) => activePlan(l) !== "free")
      .map((l) => ({ l, plan: activePlan(l), billing: billingById.get(l.id) }))
      .sort((a, b) => a.l.business_name.localeCompare(b.l.business_name));
    // Yearly subscribers count as a twelfth of the yearly price each month.
    const monthly = rows.reduce((sum, r) => { const price = plans.find((p) => p.id === r.plan)?.price ?? { month: 0, year: 0 }; return sum + (r.billing?.billing_interval === "year" ? price.year / 12 : price.month); }, 0);
    return { rows, monthly: Math.round(monthly) };
  }, [listings, billingQ.data]);
  // Money from leads that contractors paid to unlock (last 30 days).
  const unlocks = useMemo(() => {
    const since = unlocksQ.updatedAt ? unlocksQ.updatedAt.getTime() - 30 * DAY : 0;
    const recent = unlocksQ.data.filter((u) => new Date(u.unlocked_at).getTime() >= since);
    return { count: recent.length, cents: recent.reduce((sum, u) => sum + (u.unlock_cents ?? 0), 0) };
  }, [unlocksQ.data, unlocksQ.updatedAt]);

  async function setStatus(id: string, status: ListingStatus) {
    setBusyId(id);
    setListingOverrides((o) => ({ ...o, [id]: status }));
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) {
      setListingOverrides((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    } else {
      void listingsQ.reload();
    }
    setBusyId(null);
  }

  function refreshAll() {
    void Promise.all([leadsQ.reload(), viewsQ.reload(), listingsQ.reload(), privateQ.reload(), billingQ.reload(), unlocksQ.reload()]);
  }

  const queue = [
    { n: attention.newLeads, text: "new customer requests", to: "/admin/leads", icon: Inbox },
    { n: attention.newMessages, text: "new messages", to: "/admin/messages", icon: MessageSquare },
    { n: attention.pendingListings, text: "business registrations to review", to: "/admin/listings", icon: Building2 },
    { n: attention.pendingClaims, text: "ownership claims to review", to: "/admin/listings/claims", icon: Users },
  ].filter((r) => r.n > 0);

  return (
    <>
      <PageTitle title="Overview">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${days === r ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
                {r} days
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={refreshAll} aria-label="Refresh now" className="!px-3 !py-1.5 text-sm">
            <RefreshCw className="size-4" aria-hidden /> <span className="hidden sm:inline">Refresh</span>
          </Button>
          <span className="text-xs text-slate-500" aria-live="off">{updatedAt ? `Updated ${timeAgo(now - updatedAt)}` : "Loading…"}</span>
        </div>
      </PageTitle>

      {failed && (
        <p className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          Some data could not be loaded. Make sure all the SQL files in /supabase have been run.
        </p>
      )}

      <FlowHealth compact />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Needs your attention">
          {queue.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800"><Check className="size-4" aria-hidden /> All caught up. Nothing is waiting for you.</p>
          ) : (
            <ul className="space-y-2">
              {queue.map((r) => (
                <li key={r.text}>
                  <Link to={r.to} className="flex items-center gap-3 rounded-xl border border-orange-200 bg-emergency-soft px-4 py-3 hover:bg-orange-100">
                    <r.icon className="size-5 text-emergency" aria-hidden />
                    <span className="flex-1 text-sm text-navy"><strong className="tabular-nums">{r.n}</strong> {r.text}</span>
                    <span className="text-sm font-semibold text-primary">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Lead sources">
          <ul className="divide-y divide-slate-100">
            {[
              { label: "Building permits", icon: HardHat, n: attention.permits, at: attention.permitsAt, to: "/admin/permits", when: permitsSchedule },
              { label: "Government bids", icon: Landmark, n: attention.bids, at: attention.bidsAt, to: "/admin/bids", when: bidsSchedule },
            ].map((s) => (
              <li key={s.label}>
                <Link to={s.to} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-primary"><s.icon className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy">{s.label}</span>
                    <span className="block text-xs text-slate-500">{s.at ? `Last scrape ${timeAgo(now - new Date(s.at).getTime())}` : "Not scraped yet"} · {s.when}</span>
                  </span>
                  <span className="text-xl font-bold text-navy tabular-nums">{s.n.toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Visitors" value={stats.visitors} prev={stats.prevVisitors} />
        <Kpi label="Leads" value={stats.curLeads.length} prev={stats.prevLeads.length} />
        <Kpi label="Visitor → lead rate" value={stats.conversion} suffix="%"><span className="text-xs text-slate-500">Leads ÷ visitors</span></Kpi>
        <Kpi label="Paying businesses" value={paying.rows.length} tone="green">
          <span className="text-xs text-slate-500">≈ ${paying.monthly.toLocaleString()} / month in plans</span>
        </Kpi>
      </div>
      <p className="mt-2 text-xs text-slate-500">More charts, pages, sources and devices are on <Link to="/admin/analytics" className="font-semibold text-primary underline">Analytics</Link>.</p>

      {pending.length > 0 && (
        <section id="registrations" aria-labelledby="reg-title" className="mt-6 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
          <h2 id="reg-title" className="font-semibold text-navy">Business registrations to review ({pending.length})</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {pending.slice(0, 5).map((l) => {
              const priv = privateById.get(l.id);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1 basis-60">
                    <Link to={`/admin/listings/${l.id}`} className="font-semibold text-navy hover:text-primary hover:underline">{l.business_name}</Link>
                    <p className="truncate text-sm text-slate-600">{l.city}, {l.state}{l.phone ? ` · ${l.phone}` : ""}</p>
                    <p className="truncate text-xs text-slate-500">Registered {timeAgo(asOf - new Date(l.created_at).getTime())}{priv?.submitter_name ? ` by ${priv.submitter_name}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => setStatus(l.id, "published")} disabled={busyId === l.id} className="!rounded-full !px-3.5 !py-1.5 text-sm" aria-label={`Approve ${l.business_name}`}>
                      <Check className="size-4" aria-hidden /> Approve
                    </Button>
                    <Button variant="secondary" onClick={() => setStatus(l.id, "hidden")} disabled={busyId === l.id} className="!rounded-full !px-3.5 !py-1.5 text-sm" aria-label={`Decline ${l.business_name}`}>
                      <EyeOff className="size-4" aria-hidden /> Decline
                    </Button>
                    <Link to={`/admin/listings/${l.id}`} className="grid size-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:border-primary hover:text-primary" aria-label={`Review ${l.business_name}`}>
                      <ExternalLink className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to="/admin/listings" className="mt-3 inline-block text-sm font-semibold text-primary">Manage all listings →</Link>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Latest customer requests">
          {leadsQ.data.length === 0 ? (
            <p className="text-sm text-slate-500">No leads yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {leadsQ.data.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <Link to={`/admin/leads/${l.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy">{l.first_name} {l.last_name}</span>
                      <span className="block truncate text-xs text-slate-500">{l.issue} · {l.city}</span>
                    </span>
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/leads" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">Open all leads →</Link>
        </Panel>

        <Panel title="Lead unlocks (last 30 days)">
          <p className="text-3xl font-bold text-navy tabular-nums">${(unlocks.cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-sm text-slate-700">{unlocks.count} {unlocks.count === 1 ? "lead" : "leads"} unlocked by contractors.</p>
          <p className="mt-3 text-xs text-slate-500">Plan revenue is an estimate from list prices. Stripe has the exact figures, including coupons and taxes.</p>
        </Panel>
      </div>

      <section id="paying" aria-labelledby="paying-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="paying-title" className="font-semibold text-navy">Businesses that paid ({paying.rows.length})</h2>
        {paying.rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No paying businesses yet. Paid plans appear here once a contractor subscribes or you set a plan by hand.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr><th className="pb-2 font-semibold">Business</th><th className="pb-2 font-semibold">Plan</th><th className="pb-2 font-semibold">Paid through</th><th className="pb-2 font-semibold">Billing</th><th className="pb-2 font-semibold">Listing</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paying.rows.map(({ l, plan, billing }) => (
                  <tr key={l.id}>
                    <td className="py-2.5 pr-3">
                      <Link to={`/admin/listings/${l.id}`} className="font-semibold text-navy hover:text-primary hover:underline">{l.business_name}</Link>
                      <span className="block text-xs text-slate-500">{l.city}, {l.state}</span>
                    </td>
                    <td className="py-2.5 pr-3"><span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 capitalize">{plan}{billing?.billing_interval ? ` · ${billing.billing_interval === "year" ? "yearly" : "monthly"}` : ""}</span></td>
                    <td className="py-2.5 pr-3 text-slate-700">{l.plan_until ? new Date(l.plan_until).toLocaleDateString() : "No end date"}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{billing?.stripe_subscription_id ? <>Stripe · <span className="capitalize">{billing.status?.replace("_", " ")}</span></> : "Set by hand"}</td>
                    <td className="py-2.5 text-slate-700 capitalize">{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
