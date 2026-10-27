import type { ReactNode } from "react";
import type { LeadStatus } from "@/lib/types";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}

const badge: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-900",
  closed: "bg-green-100 text-green-800",
  spam: "bg-slate-200 text-slate-700",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badge[status]}`}>{status}</span>;
}

/** Horizontal bar list for ranked categories. */
export function BarList({ rows, empty = "No data yet." }: { rows: [string, number][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <ul className="space-y-2.5">
      {rows.map(([label, n]) => (
        <li key={label}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{label}</span>
            <span className="font-semibold text-navy">{n}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Simple daily column chart with an accessible text summary. */
export function DailyChart({ data, label }: { data: { date: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure>
      <div role="img" aria-label={`${label}: ${total} in the last ${data.length} days`} className="flex h-40 items-end gap-0.5">
        {data.map((d) => (
          <div key={d.date} title={`${d.date}: ${d.value}`} className="flex h-full flex-1 items-end">
            <div className="w-full rounded-t bg-primary/80" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </figcaption>
    </figure>
  );
}

export function QueryState({ loading, error, children }: { loading: boolean; error: boolean; children: ReactNode }) {
  if (error) {
    return (
      <p className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm text-orange-900">
        Could not load data. Make sure the SQL files in /supabase have been run.
      </p>
    );
  }
  if (loading) return <p className="text-slate-600">Loading…</p>;
  return <>{children}</>;
}
