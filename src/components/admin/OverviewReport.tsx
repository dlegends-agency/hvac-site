"use client";

import Link from "next/link";
import { countBy, dailyCounts, useLeads } from "@/lib/admin-hooks";
import { LEAD_STATUSES } from "@/lib/types";
import { BarList, DailyChart, Panel, PageTitle, QueryState, StatCard, StatusBadge } from "./widgets";

const DAY = 86_400_000;

export function OverviewReport() {
  const { data: leads, loading, error } = useLeads();
  const since = (days: number) => leads.filter((l) => Date.now() - new Date(l.created_at).getTime() < days * DAY).length;
  const real = leads.filter((l) => l.status !== "spam");
  const closed = leads.filter((l) => l.status === "closed").length;

  return (
    <>
      <PageTitle title="Overview" />
      <QueryState loading={loading} error={error}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total leads" value={leads.length} />
          <StatCard label="Last 7 days" value={since(7)} />
          <StatCard label="Last 30 days" value={since(30)} />
          <StatCard label="Awaiting contact" value={leads.filter((l) => l.status === "new").length} hint="Status: new" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Leads per day (30 days)">
              <DailyChart data={dailyCounts(leads.map((l) => l.created_at), 30)} label="Leads per day" />
            </Panel>
          </div>
          <Panel title="By status">
            <ul className="space-y-3">
              {LEAD_STATUSES.map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <StatusBadge status={s} />
                  <span className="font-semibold text-navy">{leads.filter((l) => l.status === s).length}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-600">
                <span>Closed rate (excl. spam)</span>
                <span className="font-semibold text-navy">{real.length ? Math.round((closed / real.length) * 100) : 0}%</span>
              </li>
            </ul>
          </Panel>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Panel title="Top issues"><BarList rows={countBy(real, (l) => l.issue)} /></Panel>
          <Panel title="Urgency"><BarList rows={countBy(real, (l) => l.urgency)} /></Panel>
          <Panel title="Top cities"><BarList rows={countBy(real, (l) => `${l.city}, ${l.state}`)} /></Panel>
          <Panel title="Property type"><BarList rows={countBy(real, (l) => `${l.property_type} · ${l.property_status}`)} /></Panel>
        </div>

        <div className="mt-6">
          <Panel title="Latest leads">
            {leads.length === 0 ? (
              <p className="text-sm text-slate-500">No leads yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {leads.slice(0, 5).map((l) => (
                  <li key={l.id}>
                    <Link href={`/admin/leads/${l.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy">{l.first_name} {l.last_name}</span>
                        <span className="block truncate text-sm text-slate-500">{l.issue} · {l.city}</span>
                      </span>
                      <StatusBadge status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/leads" className="mt-3 inline-block text-sm font-semibold text-primary">View all leads →</Link>
          </Panel>
        </div>
      </QueryState>
    </>
  );
}
