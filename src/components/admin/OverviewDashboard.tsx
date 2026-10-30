import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Building2, Check, ExternalLink, EyeOff, MapPin, Minus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { locations } from "@/config/locations";
import { plans } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { countBy, dailyCounts, useCountUp, useLiveQuery, useNow } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { LEAD_STATUSES, LISTING_STATUSES, type Lead, type Listing, type ListingBilling, type ListingPrivate, type ListingStatus, type PageView } from "@/lib/types";
import { BarList, DailyChart, PageTitle, Panel, StatusBadge } from "./widgets";

const DAY = 86_400_000;
const RANGES = [7, 30, 90] as const;
const REFRESH_MS = 30_000;

const normPath = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
const norm = (s: string) => s.trim().toLowerCase();

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

/** Tiny inline trend line. */
function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 100;
  const h = 28;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (v / max) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
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

function Kpi({ label, value, suffix = "", prev, spark, tone = "blue", children }: {
  label: string; value: number; suffix?: string; prev?: number; spark?: number[]; tone?: "blue" | "orange" | "green"; children?: React.ReactNode;
}) {
  const shown = useCountUp(value);
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${tone === "orange" ? "border-orange-200" : tone === "green" ? "border-green-200" : "border-slate-200"}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone === "orange" ? "text-emergency" : tone === "green" ? "text-green-700" : "text-navy"}`}>{shown.toLocaleString()}{suffix}</p>
      <div className="mt-1 min-h-5">{prev !== undefined ? <Delta now={value} prev={prev} /> : children}</div>
      {spark && <div className={`mt-2 ${tone === "orange" ? "text-emergency" : "text-primary"}`}><Sparkline data={spark} /></div>}
    </div>
  );
}

const statusStyle: Record<ListingStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  published: "bg-green-100 text-green-800",
  hidden: "bg-slate-200 text-slate-700",
};

export function OverviewDashboard() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [live, setLive] = useState(true);
  const [listingTab, setListingTab] = useState<ListingStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const intervalMs = live ? REFRESH_MS : null;
  const supabase = getSupabaseBrowser();

  const leadsQ = useLiveQuery<Lead[]>([], () => supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000), { key: "leads", intervalMs });
  const viewsQ = useLiveQuery<PageView[]>(
    [],
    () =>
      supabase
        .from("page_views")
        .select("created_at,path,referrer_host,utm_source,device,session_id")
        .gte("created_at", new Date(Date.now() - days * 2 * DAY).toISOString())
        .order("created_at", { ascending: false })
        .limit(20000),
    { key: `views-${days}`, intervalMs },
  );
  const listingsQ = useLiveQuery<Listing[]>([], () => supabase.from("listings").select("*").order("created_at", { ascending: false }).limit(500), { key: "listings", intervalMs });
  const billingQ = useLiveQuery<ListingBilling[]>([], () => supabase.from("listing_billing").select("*"), { key: "billing", intervalMs });
  const privateQ = useLiveQuery<ListingPrivate[]>([], () => supabase.from("listing_private").select("*"), { key: "private", intervalMs });

  const [listingOverrides, setListingOverrides] = useState<Record<string, ListingStatus>>({});
  const listings = useMemo(() => listingsQ.data.map((l) => ({ ...l, status: listingOverrides[l.id] ?? l.status })), [listingsQ.data, listingOverrides]);

  const loading = leadsQ.loading || viewsQ.loading || listingsQ.loading;
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
    return {
      cur, prev, curLeads, prevLeads, visitors, prevVisitors: sessions(prev),
      conversion: visitors ? Math.round((curLeads.length / visitors) * 1000) / 10 : 0,
      viewsSpark: dailyCounts(cur.map((v) => v.created_at), days).map((d) => d.value),
      leadsSpark: dailyCounts(curLeads.map((l) => l.created_at), days).map((d) => d.value),
    };
  }, [viewsQ.data, leadsQ.data, days, asOf]);

  // Most viewed cities: page views on each city landing page, plus leads from that city.
  const cities = useMemo(() => {
    const rows = locations.map((loc) => {
      const v = stats.cur.filter((p) => normPath(p.path) === loc.path);
      const leads = stats.curLeads.filter((l) => l.source === loc.slug || (loc.type === "city" && norm(l.city) === norm(loc.name)));
      const businesses = listings.filter((l) => l.status === "published" && (loc.type === "state" ? norm(l.state) === norm(loc.name) : norm(l.city) === norm(loc.name)));
      return {
        loc, views: v.length, visitors: new Set(v.map((p) => p.session_id).filter(Boolean)).size, leads: leads.length, businesses: businesses.length,
      };
    });
    return rows.sort((a, b) => b.views - a.views || b.leads - a.leads);
  }, [stats, listings]);
  const maxCityViews = Math.max(1, ...cities.map((c) => c.views));

  const topPages = useMemo(() => {
    const label = (p: string) => {
      const loc = locations.find((l) => l.path === p);
      return loc ? `HVAC Contractor ${loc.name}` : p;
    };
    return countBy(stats.cur.filter((v) => !v.path.startsWith("/admin")), (v) => label(normPath(v.path)), 8);
  }, [stats.cur]);

  const privateById = useMemo(() => new Map(privateQ.data.map((p) => [p.listing_id, p])), [privateQ.data]);
  const counts = useMemo(() => {
    const c: Record<ListingStatus | "all", number> = { all: listings.length, pending: 0, published: 0, hidden: 0 };
    for (const l of listings) c[l.status]++;
    return c;
  }, [listings]);
  // Businesses on a paid plan right now (a plan only counts until its paid-until date).
  const paying = useMemo(() => {
    const billingById = new Map(billingQ.data.map((b) => [b.listing_id, b]));
    const rows = listings
      .filter((l) => activePlan(l) !== "free")
      .map((l) => ({ l, plan: activePlan(l), billing: billingById.get(l.id) }))
      .sort((a, b) => (a.plan === b.plan ? a.l.business_name.localeCompare(b.l.business_name) : a.plan === "premium" ? -1 : 1));
    const monthly = rows.reduce((sum, r) => sum + (plans.find((p) => p.id === r.plan)?.price ?? 0), 0);
    return { rows, monthly };
  }, [listings, billingQ.data]);
  const shownListings = listings.filter((l) => listingTab === "all" || l.status === listingTab).slice(0, 12);

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
    void Promise.all([leadsQ.reload(), viewsQ.reload(), listingsQ.reload(), privateQ.reload(), billingQ.reload()]);
  }

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
          <button type="button" role="switch" aria-checked={live} onClick={() => setLive((l) => !l)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${live ? "border-green-300 bg-green-50 text-green-800" : "border-slate-300 bg-white text-slate-600"}`}>
            <span className={`size-2 rounded-full ${live ? "animate-pulse bg-green-500" : "bg-slate-400"}`} aria-hidden /> {live ? "Live" : "Paused"}
          </button>
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

      {counts.pending > 0 && (
        <button type="button" onClick={() => { setListingTab("pending"); document.getElementById("registrations")?.scrollIntoView({ behavior: "smooth" }); }}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-orange-300 bg-emergency-soft p-4 text-left transition-colors hover:bg-orange-100">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-emergency text-white">
            <Building2 className="size-5" aria-hidden />
            <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-xs font-bold text-emergency ring-2 ring-emergency">{counts.pending}</span>
          </span>
          <span>
            <span className="block font-semibold text-navy">{counts.pending} business {counts.pending === 1 ? "registration is" : "registrations are"} waiting for review</span>
            <span className="text-sm text-slate-700">Approve a listing to publish it in the directory.</span>
          </span>
        </button>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Page views" value={stats.cur.length} prev={stats.prev.length} spark={stats.viewsSpark} />
        <Kpi label="Visitors" value={stats.visitors} prev={stats.prevVisitors} />
        <Kpi label="Leads" value={stats.curLeads.length} prev={stats.prevLeads.length} spark={stats.leadsSpark} />
        <Kpi label="Visitor → lead rate" value={stats.conversion} suffix="%"><span className="text-xs text-slate-500">Leads ÷ visitors</span></Kpi>
        <Kpi label="Listings to review" value={counts.pending} tone={counts.pending > 0 ? "orange" : "blue"}>
          <span className="text-xs text-slate-500">{counts.published} published · {counts.hidden} hidden</span>
        </Kpi>
        <Kpi label="Paying businesses" value={paying.rows.length} tone="green">
          <span className="text-xs text-slate-500">≈ ${paying.monthly.toLocaleString()} / month at list price</span>
        </Kpi>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title={`Most viewed cities (${days} days)`}>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <ul className="space-y-3">
                {cities.map((c, i) => (
                  <li key={c.loc.slug} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3">
                    <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${i === 0 && c.views > 0 ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
                        <a href={c.loc.path} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-navy hover:text-primary hover:underline">
                          {c.loc.type === "city" ? `${c.loc.name}, ${c.loc.state}` : c.loc.name}
                        </a>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-primary transition-all duration-700" style={{ width: `${(c.views / maxCityViews) * 100}%` }} />
                      </div>
                    </div>
                    <dl className="flex gap-4 text-right text-xs">
                      <div><dt className="text-slate-500">Views</dt><dd className="text-sm font-bold text-navy tabular-nums">{c.views}</dd></div>
                      <div className="hidden sm:block"><dt className="text-slate-500">Visitors</dt><dd className="text-sm font-bold text-navy tabular-nums">{c.visitors}</dd></div>
                      <div><dt className="text-slate-500">Leads</dt><dd className="text-sm font-bold text-navy tabular-nums">{c.leads}</dd></div>
                      <div className="hidden sm:block"><dt className="text-slate-500">Listed</dt><dd className="text-sm font-bold text-navy tabular-nums">{c.businesses}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-slate-500">Views are visits to each city landing page. Leads come from requests submitted on that page or from that city.</p>
          </Panel>
        </div>
        <Panel title="Leads by status">
          <ul className="space-y-3">
            {LEAD_STATUSES.map((s) => (
              <li key={s} className="flex items-center justify-between">
                <StatusBadge status={s} />
                <span className="font-semibold text-navy tabular-nums">{leadsQ.data.filter((l) => l.status === s).length}</span>
              </li>
            ))}
          </ul>
          <Link to="/admin/leads" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"><Users className="size-4" aria-hidden /> Open all leads →</Link>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Page views per day (${days} days)`}><DailyChart data={dailyCounts(stats.cur.map((v) => v.created_at), days)} label="Page views per day" /></Panel>
        <Panel title={`Leads per day (${days} days)`}><DailyChart data={dailyCounts(stats.curLeads.map((l) => l.created_at), days)} label="Leads per day" /></Panel>
      </div>

      <section id="paying" aria-labelledby="paying-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="paying-title" className="font-semibold text-navy">Businesses that paid ({paying.rows.length})</h2>
          <p className="text-xs text-slate-500">Revenue is an estimate from plan list prices. Stripe has the exact figures, including coupons and taxes.</p>
        </div>
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
                    <td className="py-2.5 pr-3"><span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 capitalize">{plan}</span></td>
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

      <section id="registrations" aria-labelledby="reg-title" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reg-title" className="font-semibold text-navy">Business registrations</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter registrations by status">
            {(["all", ...LISTING_STATUSES] as const).map((s) => (
              <button key={s} type="button" aria-pressed={listingTab === s} onClick={() => setListingTab(s)}
                className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${listingTab === s ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
                {s} ({counts[s]})
              </button>
            ))}
          </div>
        </div>

        {shownListings.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            {listings.length === 0 ? "No businesses have registered yet. Submissions from the “List your business” form appear here." : "No registrations with this status."}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {shownListings.map((l) => {
              const priv = privateById.get(l.id);
              const isNew = asOf - new Date(l.created_at).getTime() < DAY && l.status === "pending";
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                      <Link to={`/admin/listings/${l.id}`} className="hover:text-primary hover:underline">{l.business_name}</Link>
                      {isNew && <span className="rounded-full bg-emergency px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">New</span>}
                    </p>
                    <p className="truncate text-sm text-slate-600">
                      {l.city}, {l.state}{l.phone ? ` · ${l.phone}` : ""} · {l.services.length} {l.services.length === 1 ? "service" : "services"}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      Registered {timeAgo(asOf - new Date(l.created_at).getTime())}{priv?.submitter_name ? ` by ${priv.submitter_name}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyle[l.status]}`}>{l.status}</span>
                  <div className="flex items-center gap-2">
                    {l.status !== "published" && (
                      <Button onClick={() => setStatus(l.id, "published")} disabled={busyId === l.id} className="!rounded-full !px-3.5 !py-1.5 text-sm" aria-label={`Approve ${l.business_name}`}>
                        <Check className="size-4" aria-hidden /> Approve
                      </Button>
                    )}
                    {l.status !== "hidden" && (
                      <Button variant="secondary" onClick={() => setStatus(l.id, "hidden")} disabled={busyId === l.id} className="!rounded-full !px-3.5 !py-1.5 text-sm" aria-label={`${l.status === "pending" ? "Decline" : "Hide"} ${l.business_name}`}>
                        <EyeOff className="size-4" aria-hidden /> {l.status === "pending" ? "Decline" : "Hide"}
                      </Button>
                    )}
                    <Link to={`/admin/listings/${l.id}`} className="grid size-9 place-items-center rounded-full border border-slate-200 text-slate-600 hover:border-primary hover:text-primary" aria-label={`Review ${l.business_name}`}>
                      <ExternalLink className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Link to="/admin/listings" className="mt-3 inline-block text-sm font-semibold text-primary">Manage all listings →</Link>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Top pages"><BarList rows={topPages} empty="No page views yet." /></Panel>
        <Panel title="Traffic sources"><BarList rows={countBy(stats.cur, (v) => v.utm_source ?? v.referrer_host ?? "Direct / none", 6)} empty="No traffic yet." /></Panel>
        <Panel title="Top issues requested"><BarList rows={countBy(stats.curLeads.flatMap((l) => l.issue.split(", ").map((issue) => ({ issue }))), (l) => l.issue)} empty="No leads yet." /></Panel>
        <Panel title="Latest leads">
          {leadsQ.data.length === 0 ? (
            <p className="text-sm text-slate-500">No leads yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {leadsQ.data.slice(0, 5).map((l) => (
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
        </Panel>
      </div>
    </>
  );
}
