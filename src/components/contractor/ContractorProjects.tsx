import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Loader2, MapPin, Plus, Search, UserRound } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_STYLE, shortDate, usd, type Project, type ProjectStatus } from "@/lib/projects";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useContractor } from "./context";
import { useProjects } from "./useProjects";

type TabId = "all" | ProjectStatus;
const TABS: { id: TabId; label: string }[] = [{ id: "all", label: "All Projects" }, ...PROJECT_STATUSES.map((s) => ({ id: s as TabId, label: PROJECT_STATUS_LABEL[s] }))];

function NewProject({ listingId, onDone }: { listingId: string; onDone: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const value = String(f.get("value") ?? "").trim();
    const { data, error: err } = await getSupabaseBrowser().from("projects").insert({
      listing_id: listingId, name, client_name: String(f.get("client") ?? "").trim() || null, location: String(f.get("location") ?? "").trim() || null,
      contract_value: value ? Number(value) : null, status: String(f.get("status")),
    }).select("id").single();
    setBusy(false);
    if (err || !data) return setError("The project could not be created. Has supabase/schema-projects.sql been run?");
    onDone((data as { id: string }).id);
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">Project name<input id="np-name" name="name" required maxLength={300} className={`${inputClass} mt-1`} placeholder="Riverside Elementary roof units" /></label>
      <label className="text-sm font-medium text-slate-700 lg:col-span-3">Client (optional)<input id="np-client" name="client" maxLength={200} className={`${inputClass} mt-1`} /></label>
      <label className="text-sm font-medium text-slate-700 lg:col-span-2">Location (optional)<input id="np-location" name="location" maxLength={300} className={`${inputClass} mt-1`} /></label>
      <label className="text-sm font-medium text-slate-700 lg:col-span-2">Contract value ($) (optional)<input id="np-value" name="value" type="number" min="0" step="0.01" className={`${inputClass} mt-1`} /></label>
      <label className="text-sm font-medium text-slate-700 lg:col-span-2">Status
        <select name="status" defaultValue="evaluating" className={`${inputClass} mt-1`}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}</select>
      </label>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-6">
        <Button type="submit" disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Create project</Button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}

function Card({ p, progress }: { p: Project; progress?: { done: number; total: number } }) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PROJECT_STATUS_STYLE[p.status]}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
          <h2 className="mt-1.5 line-clamp-2 text-base font-bold text-navy" title={p.name}><Link to={`/contractor/projects/${p.id}`} className="hover:text-primary">{p.name}</Link></h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {(p.client_company || p.client_name) && <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" aria-hidden /> {[p.client_name, p.client_company].filter(Boolean).join(" · ")}</span>}
            {p.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {p.location}</span>}
            {(p.start_on || p.expected_end_on) && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden /> {shortDate(p.start_on)} to {shortDate(p.expected_end_on)}</span>}
            {p.lead_kind && <span>From a lead</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Contract value</p>
          <p className="text-base font-bold text-navy">{usd(p.contract_value)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        {pct !== null ? (
          <div className="flex min-w-40 flex-1 items-center gap-2 text-xs text-slate-600">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tasks done"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
            {progress?.done}/{progress?.total} tasks
          </div>
        ) : <span className="flex-1 text-xs text-slate-500">No tasks yet</span>}
        <Link to={`/contractor/projects/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">View Project <ArrowRight className="size-4" aria-hidden /></Link>
      </div>
    </li>
  );
}

/** My Projects: the jobs and contracts you have actually won. A lead becomes a project only when you convert an accepted one in My Leads. */
export default function ContractorProjects() {
  const { listing } = useContractor();
  const navigate = useNavigate();
  const { projects, progress, loaded, error } = useProjects(Boolean(listing));
  const [tab, setTab] = useState<TabId>("all");
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const c = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<TabId, number>;
    c.all = projects.length;
    for (const p of projects) c[p.status]++;
    return c;
  }, [projects]);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = projects.filter((p) => (tab === "all" || p.status === tab) && (!q || `${p.name} ${p.client_name ?? ""} ${p.client_company ?? ""} ${p.location ?? ""}`.toLowerCase().includes(q)));
  const stats = useMemo(() => {
    const active = projects.filter((p) => ["awarded", "in_progress"].includes(p.status));
    const sum = (list: Project[]) => list.reduce((t, p) => t + Number(p.contract_value ?? 0), 0);
    return { active: active.length, activeValue: sum(active), done: projects.filter((p) => p.status === "completed").length, doneValue: sum(projects.filter((p) => p.status === "completed")), pipeline: projects.filter((p) => ["evaluating", "preparing_proposal", "bid_submitted"].includes(p.status)).length };
  }, [projects]);

  if (!listing) {
    return (
      <>
        <PageTitle title="My Projects" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  return (
    <>
      <PageTitle title="My Projects" description="Jobs and contracts you have won. Convert an accepted lead in My Leads and its details move here, so nothing is typed twice.">
        <Button onClick={() => setAdding((a) => !a)} variant="secondary" className="!rounded-full text-sm"><Plus className="size-4" aria-hidden /> New project</Button>
      </PageTitle>
      {adding && <NewProject listingId={listing.id} onDone={(id) => navigate(`/contractor/projects/${id}`)} />}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active projects", value: loaded ? stats.active : "…", hint: "Awarded or in progress", tone: "border-blue-200 bg-blue-50/60" },
          { label: "Active value", value: loaded ? usd(stats.activeValue) : "…", hint: "Contract value", tone: "border-slate-200 bg-white" },
          { label: "Being prepared", value: loaded ? stats.pipeline : "…", hint: "Evaluating to submitted", tone: "border-amber-200 bg-amber-50/60" },
          { label: "Completed", value: loaded ? stats.done : "…", hint: loaded ? usd(stats.doneValue) : "", tone: "border-emerald-200 bg-emerald-50/60" },
        ].map((t) => (
          <div key={t.label} className={`rounded-2xl border p-3.5 ${t.tone}`}><p className="text-xs font-semibold text-slate-600">{t.label}</p><p className="mt-0.5 text-xl font-extrabold text-navy">{t.value}</p><p className="text-xs text-slate-600">{t.hint}</p></div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label="Project status" className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 py-2.5 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
            {t.label} <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${tab === t.id ? "bg-blue-100 text-primary" : "bg-slate-100 text-slate-600"}`}>{loaded ? counts[t.id] : "…"}</span>
          </button>
        ))}
      </div>
      <label className="relative">
        <span className="sr-only">Search projects</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" className="w-48 rounded-full border border-slate-300 bg-white py-1.5 pr-3 pl-9 text-sm" />
      </label>
      </div>

      {error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Projects could not be loaded. Run <code>supabase/schema-projects.sql</code> in the Supabase SQL Editor.</p>
      ) : !loaded ? (
        <p className="text-slate-600">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-navy">{projects.length === 0 ? "No projects yet" : "Nothing in this tab"}</p>
          <p className="mt-2 text-sm text-slate-600">{projects.length === 0 ? "When a customer accepts your offer, open the lead in My Leads and choose Convert to Project." : "Change a project's status and it moves between tabs."}</p>
          {projects.length === 0 && <Link to="/contractor/my-leads" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">Go to My Leads <ArrowRight className="size-4" aria-hidden /></Link>}
        </div>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">{shown.map((p) => <Card key={p.id} p={p} progress={progress[p.id]} />)}</ul>
      )}
    </>
  );
}
