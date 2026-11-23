import { useState } from "react";
import { locations } from "@/config/locations";
import { Link } from "react-router-dom";
import { countBy, dailyCounts, useLeads, useLiveQuery, usePageViews } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { BarList, DailyChart, PageTitle, Panel, QueryState, StatCard } from "./widgets";

const RANGES = [7, 30, 90] as const;

interface ListingStats {
  totals: { impressions: number; featured_impressions: number; views: number; featured_views: number; visitors: number; actions: number; featured_actions: number; listings_seen: number };
  top: { slug: string; name: string; city: string; featured: boolean; impressions: number; views: number; actions: number }[];
}

export function AnalyticsReport() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const views = usePageViews(days);
  const leadsQ = useLeads();
  const [now] = useState(() => Date.now());
  const lq = useLiveQuery<ListingStats | null>(null, () => getSupabaseBrowser().rpc("admin_listing_analytics", { p_days: days }), { key: `admin-listing-analytics-${days}`, intervalMs: 60_000 });
  const ls = lq.data;
  const leads = leadsQ.data.filter((l) => now - new Date(l.created_at).getTime() < days * 86_400_000 && l.status !== "spam");

  const sessions = new Set(views.data.map((v) => v.session_id).filter(Boolean)).size;
  const conversion = sessions ? ((leads.length / sessions) * 100).toFixed(1) : "0.0";
  const home = views.data.filter((v) => v.path === "/").length;
  const blog = views.data.filter((v) => v.path.startsWith("/blog")).length;
  const direct = views.data.filter((v) => !v.referrer_host && !v.utm_source).length;

  return (
    <>
      <PageTitle title="Analytics">
        <div className="flex gap-2" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${days === r ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
              {r} days
            </button>
          ))}
        </div>
      </PageTitle>

      <QueryState loading={views.loading || leadsQ.loading} error={views.error || leadsQ.error}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Page views" value={views.data.length.toLocaleString()} />
          <StatCard label="Visitors (browsers)" value={sessions.toLocaleString()} hint="Unique anonymous browser ids" />
          <StatCard label="Leads" value={leads.length} hint="Excludes spam" />
          <StatCard label="Visitor → lead rate" value={`${conversion}%`} hint="Leads ÷ visitors" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Page views per day"><DailyChart data={dailyCounts(views.data.map((v) => v.created_at), days)} label="Page views per day" /></Panel>
          <Panel title="Leads per day"><DailyChart data={dailyCounts(leads.map((l) => l.created_at), days)} label="Leads per day" /></Panel>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Panel title="Top pages"><BarList rows={countBy(views.data, (v) => v.path, 10)} /></Panel>
          <Panel title="Traffic sources">
            <BarList rows={[...countBy(views.data, (v) => v.utm_source ?? v.referrer_host, 8), ["Direct / none", direct] as [string, number]].filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1])} />
          </Panel>
          <Panel title="Devices"><BarList rows={countBy(views.data, (v) => v.device)} /></Panel>
          <Panel title="Lead sources"><BarList rows={countBy(leads, (l) => l.source ?? "homepage")} /></Panel>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Most viewed cities">
            <BarList rows={locations.map((loc): [string, number] => [loc.type === "city" ? `${loc.name}, ${loc.state}` : loc.name, views.data.filter((v) => (v.path.length > 1 ? v.path.replace(/\/+$/, "") : v.path) === loc.path).length]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10)} empty="No city page views yet." />
          </Panel>
          <Panel title="Top issues requested">
            <BarList rows={countBy(leads.flatMap((l) => l.issue.split(", ").map((issue) => ({ issue }))), (l) => l.issue, 10)} empty="No leads yet." />
          </Panel>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Homepage views" value={home.toLocaleString()} />
          <StatCard label="Blog views" value={blog.toLocaleString()} />
          <StatCard label="Views per visitor" value={sessions ? (views.data.length / sessions).toFixed(1) : "0.0"} />
        </div>

        <h2 className="mt-8 mb-3 text-lg font-bold text-navy">Company listings</h2>
        {lq.error && !ls ? (
          <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Listing analytics are not set up yet. Run <code>supabase/schema-analytics.sql</code> in the Supabase SQL Editor.</p>
        ) : !ls ? <p className="text-slate-600">Loading…</p> : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Shown in lists" value={ls.totals.impressions.toLocaleString()} hint={`${ls.totals.featured_impressions.toLocaleString()} as featured`} />
              <StatCard label="Listing views" value={ls.totals.views.toLocaleString()} hint={`${ls.totals.featured_views.toLocaleString()} on featured listings`} />
              <StatCard label="Contact actions" value={ls.totals.actions.toLocaleString()} hint="Calls, emails, website, directions" />
              <StatCard label="Listings seen" value={ls.totals.listings_seen.toLocaleString()} hint={`${ls.totals.visitors.toLocaleString()} visitors opened one`} />
            </div>
            <Panel title="Most viewed listings" className="mt-4">
              {ls.top.length === 0 ? <p className="text-sm text-slate-600">No listing activity yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-500 uppercase"><tr><th className="py-2 pr-3">Business</th><th className="px-3 text-right">Shown</th><th className="px-3 text-right">Views</th><th className="pl-3 text-right">Contact actions</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ls.top.map((t) => (
                        <tr key={t.slug}>
                          <td className="py-2 pr-3"><Link to={`/directory/${t.slug}`} className="font-semibold text-navy hover:text-primary">{t.name}</Link>{t.featured && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Featured</span>}<span className="block text-xs text-slate-500">{t.city}</span></td>
                          <td className="px-3 text-right tabular-nums">{t.impressions}</td><td className="px-3 text-right font-semibold tabular-nums">{t.views}</td><td className="pl-3 text-right tabular-nums">{t.actions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}

        <p className="mt-6 text-xs text-slate-500">
          Counts come from a lightweight built-in tracker (no cookies, no IP addresses). Visitors using Do Not Track are not counted, and a
          visitor who clears browser storage appears as a new browser. Mention analytics in your privacy policy.
        </p>
      </QueryState>
    </>
  );
}
