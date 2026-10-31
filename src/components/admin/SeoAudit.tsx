import { useMemo, useState } from "react";
import { AlertTriangle, Download, Info, Loader2, OctagonAlert, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { issuesToCsv, runAudit, type AuditReport } from "@/lib/seo-audit/run";
import { RULE_LABELS, type Issue, type PageResult, type Severity } from "@/lib/seo-audit/rules";
import { PageTitle, Panel, StatCard } from "./widgets";

const SEVERITIES: Severity[] = ["error", "warning", "info"];
const style: Record<Severity, { badge: string; label: string; Icon: typeof Info }> = {
  error: { badge: "bg-red-100 text-red-800", label: "Error", Icon: OctagonAlert },
  warning: { badge: "bg-amber-100 text-amber-900", label: "Warning", Icon: AlertTriangle },
  info: { badge: "bg-slate-200 text-slate-700", label: "Info", Icon: Info },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const { badge, label, Icon } = style[severity];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}><Icon className="size-3.5" aria-hidden /> {label}</span>;
}

const worst = (issues: Issue[]): Severity | null => SEVERITIES.find((s) => issues.some((i) => i.severity === s)) ?? null;

export function SeoAudit() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, path: "" });
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Record<Severity, boolean>>({ error: true, warning: true, info: false });
  const [q, setQ] = useState("");

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setReport(await runAudit((done, total, path) => setProgress({ done, total, path })));
    } catch (e) {
      setError(`The audit failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([issuesToCsv(report)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `seo-audit-${report.startedAt.slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const term = q.trim().toLowerCase();
  const visible = useMemo(
    () => (report?.issues ?? []).filter((i) => show[i.severity] && (!term || `${i.url ?? ""} ${i.message}`.toLowerCase().includes(term))),
    [report, show, term],
  );
  const counts = useMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const i of report?.issues ?? []) c[i.severity]++;
    return c;
  }, [report]);

  const siteWide = visible.filter((i) => !i.url);
  const byRule = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of visible.filter((i) => i.url)) map.set(i.rule, [...(map.get(i.rule) ?? []), i]);
    return [...map.entries()].sort((a, b) => SEVERITIES.indexOf(worst(a[1])!) - SEVERITIES.indexOf(worst(b[1])!) || b[1].length - a[1].length);
  }, [visible]);

  return (
    <>
      <PageTitle title="SEO Audit">
        {report && <Button variant="secondary" onClick={download}><Download className="size-4" aria-hidden /> Export CSV</Button>}
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} {report ? "Run again" : "Run audit"}
        </Button>
      </PageTitle>

      <p className="text-sm text-slate-600">
        Audits every public page of this site: titles, meta descriptions, canonicals, headings, structured data, images, internal links, duplicates and orphan pages,
        plus robots.txt, the sitemap and your published blog and directory content. Pages are loaded as a browser renders them; static pages are also checked in the raw server HTML that crawlers receive first.
        The results are a checklist of specific issues, not a ranking prediction.
      </p>
      {import.meta.env.DEV && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You&apos;re on the local dev server. Server-HTML checks are skipped and the sitemap isn&apos;t available here. Run the audit on the deployed site for full results.
        </p>
      )}

      {running && (
        <div className="mt-5" role="status" aria-live="polite">
          <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <p className="mt-2 text-sm text-slate-600">Auditing {progress.done} of {progress.total}{progress.path ? `: ${progress.path}` : "…"}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {report && !running && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Pages audited" value={report.pages.length} hint={`${(report.durationMs / 1000).toFixed(0)}s · ${new Date(report.startedAt).toLocaleString()}`} />
            <StatCard label="Errors" value={counts.error} hint="Fix first" />
            <StatCard label="Warnings" value={counts.warning} hint="Worth improving" />
            <StatCard label="Notes" value={counts.info} hint="For awareness" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show severities">
              {SEVERITIES.map((s) => (
                <button key={s} type="button" aria-pressed={show[s]} onClick={() => setShow((p) => ({ ...p, [s]: !p[s] }))}
                  className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${show[s] ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
                  {s} ({counts[s]})
                </button>
              ))}
            </div>
            <label htmlFor="audit-q" className="sr-only">Filter issues</label>
            <input id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by URL or text…" className={`${inputClass} !w-64`} />
          </div>

          {siteWide.length > 0 && (
            <Panel title="Site-wide">
              <ul className="space-y-3">
                {siteWide.map((i, n) => (
                  <li key={n} className="flex gap-3">
                    <SeverityBadge severity={i.severity} />
                    <div className="min-w-0 text-sm">
                      <p className="text-navy"><span className="font-semibold">{RULE_LABELS[i.rule] ?? i.rule}:</span> {i.message}</p>
                      {i.detail && <p className="mt-0.5 break-words text-xs text-slate-500">{i.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title={`Issues by check (${byRule.length})`}>
            {byRule.length === 0 ? (
              <p className="text-sm text-slate-600">No page issues for the selected filters.</p>
            ) : (
              <div className="space-y-2">
                {byRule.map(([rule, list]) => (
                  <details key={rule} className="rounded-xl border border-slate-200">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                      <SeverityBadge severity={worst(list)!} />
                      <span className="font-semibold text-navy">{RULE_LABELS[rule] ?? rule}</span>
                      <span className="text-sm text-slate-500">{list.length} {list.length === 1 ? "page" : "issues"}</span>
                    </summary>
                    <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4">
                      {list.map((i, n) => (
                        <li key={n} className="py-2.5 text-sm">
                          <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{i.url}</a>
                          <p className="text-slate-700">{i.message}</p>
                          {i.detail && <p className="break-words text-xs text-slate-500">{i.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="All pages">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Page</th><th className="pr-3">Title</th><th className="pr-3">Description</th>
                    <th className="pr-3">H1</th><th className="pr-3">Words</th><th className="pr-3">Schema</th><th className="pr-3">Links</th><th>Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.pages.filter((p) => !term || p.url.toLowerCase().includes(term)).map((p) => <PageRow key={p.url} page={p} />)}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function PageRow({ page: p }: { page: PageResult }) {
  const [open, setOpen] = useState(false);
  const w = worst(p.issues);
  return (
    <>
      <tr className="align-top">
        <td className="py-2.5 pr-3">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-left font-medium text-primary hover:underline">{p.url}</button>
          <div className="text-xs text-slate-500">{p.kind}</div>
        </td>
        <td className="pr-3">{p.titleLen}</td>
        <td className="pr-3">{p.descLen}</td>
        <td className="pr-3">{p.h1Count}</td>
        <td className="pr-3">{p.words}</td>
        <td className="pr-3">{p.schemaTypes.length ? [...new Set(p.schemaTypes)].join(", ") : "—"}</td>
        <td className="pr-3">{p.internalLinks.length} in / {p.externalLinks} out</td>
        <td>{w ? <SeverityBadge severity={w} /> : <span className="text-xs text-green-700">None</span>} <span className="text-xs text-slate-500">{p.issues.length || ""}</span></td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={8} className="px-3 py-3">
            <p className="text-xs text-slate-600"><strong>Title:</strong> {p.title || "—"}</p>
            <p className="text-xs text-slate-600"><strong>Description:</strong> {p.description || "—"}</p>
            <p className="text-xs text-slate-600"><strong>H1:</strong> {p.h1 || "—"}</p>
            <p className="text-xs text-slate-600"><strong>Canonical:</strong> {p.canonical || "—"}</p>
            {p.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {p.issues.map((i, n) => <li key={n} className="flex gap-2 text-sm"><SeverityBadge severity={i.severity} /> <span>{i.message}</span></li>)}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
