import { useState } from "react";
import { countBy, dailyCounts, useLeads, usePageViews } from "@/lib/admin-hooks";
import { BarList, DailyChart, PageTitle, Panel, QueryState, StatCard } from "./widgets";

const RANGES = [7, 30, 90] as const;

export function AnalyticsReport() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const views = usePageViews(days);
  const leadsQ = useLeads();
  const [now] = useState(() => Date.now());
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

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Homepage views" value={home.toLocaleString()} />
          <StatCard label="Blog views" value={blog.toLocaleString()} />
          <StatCard label="Views per visitor" value={sessions ? (views.data.length / sessions).toFixed(1) : "0.0"} />
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Counts come from a lightweight built-in tracker (no cookies, no IP addresses). Visitors using Do Not Track are not counted, and a
          visitor who clears browser storage appears as a new browser. Mention analytics in your privacy policy.
        </p>
      </QueryState>
    </>
  );
}
