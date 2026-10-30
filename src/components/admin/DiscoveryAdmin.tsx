import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Bot, ExternalLink, Info, Loader2, MapPin, Play, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, SelectWrap, inputClass } from "@/components/ui/Field";
import { useLiveQuery, useNow } from "@/lib/admin-hooks";
import { safeUrl, slugify } from "@/lib/directory";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { DiscoveryJob, DiscoveryRun, ListingCandidate } from "@/lib/types";
import { DirectoryTabs } from "./DirectoryTabs";
import { PageTitle, Panel } from "./widgets";

const OSM_ATTRIBUTION = "Business details from OpenStreetMap contributors (ODbL, openstreetmap.org/copyright).";

function ago(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function DiscoveryAdmin() {
  const supabase = getSupabaseBrowser();
  const navigate = useNavigate();
  const now = useNow(30_000);

  const jobsQ = useLiveQuery<DiscoveryJob[]>([], () => supabase.from("discovery_jobs").select("*").order("created_at", { ascending: false }), { key: "jobs", intervalMs: 30_000 });
  const candQ = useLiveQuery<ListingCandidate[]>([], () => supabase.from("listing_candidates").select("*").order("confidence", { ascending: false }).limit(500), { key: "cands", intervalMs: 30_000 });
  const runsQ = useLiveQuery<DiscoveryRun[]>([], () => supabase.from("discovery_runs").select("*").order("started_at", { ascending: false }).limit(8), { key: "runs", intervalMs: 30_000 });

  const [running, setRunning] = useState<string | "all" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [jobFilter, setJobFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ location: "", query: "HVAC contractor", max: "20", frequency: "weekly" });
  const [formError, setFormError] = useState<string | null>(null);

  const jobById = useMemo(() => new Map(jobsQ.data.map((j) => [j.id, j])), [jobsQ.data]);
  const candidates = candQ.data.filter((c) => !gone.has(c.id) && (!jobFilter || c.job_id === jobFilter));

  /** Starts the agent right away when the optional Run-now function is set up; otherwise queues the job for the next scheduled run. */
  async function run(jobId?: string) {
    setRunning(jobId ?? "all");
    setMsg(null);
    const ids = jobId ? [jobId] : jobsQ.data.filter((j) => j.enabled).map((j) => j.id);
    // Flag the searches first, so the agent runs exactly these even if it is only started by the schedule.
    await supabase.from("discovery_jobs").update({ run_requested: true }).in("id", ids);
    let started = false;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/run-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ jobIds: ids }),
      });
      started = res.ok;
    } catch {
      started = false;
    }
    setRunning(null);
    setMsg({
      ok: true,
      text: started
        ? "The agent has been started. It usually takes a few minutes; this page refreshes by itself."
        : "Queued. The agent picks it up on its next check (every 6 hours), or start it now from GitHub: Actions > Discovery agent > Run workflow.",
    });
    void jobsQ.reload();
  }

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    const location = form.location.trim();
    const query = form.query.trim();
    if (location.length < 2) return setFormError("Enter a location, for example Austin, TX.");
    if (query.length < 2) return setFormError("Enter what to search for.");
    setFormError(null);
    const { error } = await supabase.from("discovery_jobs").insert({ label: location, query, location, max_results: Number(form.max), frequency: form.frequency });
    if (error) return setFormError("Could not save the search. Make sure the latest schema-discovery.sql has been run.");
    setForm((f) => ({ ...f, location: "" }));
    void jobsQ.reload();
  }

  async function patchJob(id: string, patch: Partial<DiscoveryJob>) {
    await supabase.from("discovery_jobs").update(patch).eq("id", id);
    void jobsQ.reload();
  }

  async function deleteJob(job: DiscoveryJob) {
    if (!window.confirm(`Delete the search "${job.label}"? Its candidates stay in the list.`)) return;
    await supabase.from("discovery_jobs").delete().eq("id", job.id);
    void jobsQ.reload();
  }

  async function reject(c: ListingCandidate) {
    setBusyId(c.id);
    await supabase.from("discovery_rejected").upsert({ external_id: c.external_id });
    await supabase.from("listing_candidates").delete().eq("id", c.id);
    setGone((g) => new Set(g).add(c.id));
    setBusyId(null);
  }

  async function importCandidate(c: ListingCandidate) {
    if (!window.confirm(`Create a pending listing for "${c.name}"?\n\nYou will review it in the editor before it can be published.`)) return;
    setBusyId(c.id);
    const job = c.job_id ? jobById.get(c.job_id) : undefined;
    const id = crypto.randomUUID();
    const city = c.city ?? job?.location.split(",")[0]?.trim() ?? "";
    const { error } = await supabase.from("listings").insert({
      id, slug: `${slugify(`${c.name} ${city}`)}-${id.slice(0, 4)}`, status: "pending", source: "agent", source_url: c.source_url,
      attribution: c.origin === "osm" && !c.verified ? OSM_ATTRIBUTION : null,
      business_name: c.name, phone: c.phone, website: c.website, address: c.address, city, state: c.state ?? "Texas", postal_code: c.postal_code,
      services: c.services, emergency_service: c.emergency,
    });
    if (error) {
      setBusyId(null);
      return setMsg({ ok: false, text: error.code === "23505" ? "That business is already in the directory." : "Could not create the listing." });
    }
    await supabase.from("listing_private").insert({
      listing_id: id,
      admin_notes: `Found by the discovery agent on ${new Date().toLocaleDateString()} (confidence ${c.confidence}%). ${c.notes ?? ""} Verify every detail on the business's own website before publishing.`.trim(),
    });
    await supabase.from("listing_candidates").delete().eq("id", c.id);
    navigate(`/admin/listings/${id}`);
  }

  return (
    <>
      <PageTitle title="Directory">
        <Button onClick={() => run()} disabled={running !== null || jobsQ.data.length === 0} className="!py-2 text-sm">
          {running === "all" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Run all searches now
        </Button>
      </PageTitle>
      <DirectoryTabs />

      <div className="mb-6 flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>
          The <strong>discovery agent</strong> is free to run: it looks up HVAC businesses on OpenStreetMap (and web search when configured), then visits each business&apos;s
          <strong> own website</strong> to confirm the phone, address and services, respecting robots.txt. It does not scrape Google. Candidates it can confirm are marked
          <strong> Verified</strong>; you still review each one before it becomes a pending listing.
        </p>
      </div>

      {msg && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Panel title="Searches">
            <form onSubmit={addJob} noValidate className="space-y-4 border-b border-slate-100 pb-5">
              <Field id="job-location" label="Location" hint="City and state, for example Austin, TX" error={formError ?? undefined}>
                {(a) => <input id="job-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} {...a} />}
              </Field>
              <Field id="job-query" label="Search for">
                {(a) => <input id="job-query" value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} className={inputClass} {...a} />}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="job-max" label="Max results">
                  {(a) => (
                    <SelectWrap>
                      <select id="job-max" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} className={inputClass} {...a}>
                        {["10", "20", "40", "60"].map((n) => <option key={n}>{n}</option>)}
                      </select>
                    </SelectWrap>
                  )}
                </Field>
                <Field id="job-freq" label="Runs">
                  {(a) => (
                    <SelectWrap>
                      <select id="job-freq" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass} {...a}>
                        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Manual only</option>
                      </select>
                    </SelectWrap>
                  )}
                </Field>
              </div>
              <Button type="submit" className="!rounded-full text-sm"><Plus className="size-4" aria-hidden /> Add search</Button>
            </form>

            {jobsQ.data.length === 0 ? (
              <p className="pt-4 text-sm text-slate-500">No searches yet. Add a location above, then run it.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {jobsQ.data.map((j) => (
                  <li key={j.id} className="py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold text-navy"><MapPin className="size-4 shrink-0 text-primary" aria-hidden /> {j.location}</p>
                        <p className="text-xs text-slate-500">&ldquo;{j.query}&rdquo; · up to {j.max_results} · {j.frequency}</p>
                        <p className={`mt-1 text-xs ${j.last_status && j.last_status !== "ok" ? "text-red-700" : "text-slate-500"}`}>
                          {j.run_requested
                            ? "Queued: waiting for the agent"
                            : j.last_run_at ? `Last run ${ago(now - new Date(j.last_run_at).getTime())}: ${j.last_status === "ok" ? `${j.last_found ?? 0} new` : j.last_status}` : "Never run"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" role="switch" aria-checked={j.enabled} aria-label={`${j.enabled ? "Disable" : "Enable"} ${j.location}`} onClick={() => patchJob(j.id, { enabled: !j.enabled })}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${j.enabled ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>{j.enabled ? "On" : "Off"}</button>
                        <Button variant="secondary" onClick={() => run(j.id)} disabled={running !== null || j.run_requested} className="!rounded-full !px-3 !py-1 text-xs" aria-label={`Run ${j.location} now`}>
                          {running === j.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />} Run
                        </Button>
                        <button type="button" onClick={() => deleteJob(j)} aria-label={`Delete ${j.location}`} className="grid size-7 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Agent activity">
            {runsQ.data.length === 0 ? (
              <p className="text-sm text-slate-500">No runs yet. When the agent runs, what it searched and decided shows here.</p>
            ) : (
              <ul className="space-y-2">
                {runsQ.data.map((r) => (
                  <li key={r.id}>
                    <details className="rounded-xl border border-slate-200 p-3">
                      <summary className="flex cursor-pointer items-center gap-2 text-sm">
                        <Bot className="size-4 text-primary" aria-hidden />
                        <span className="font-medium text-navy">{jobById.get(r.job_id ?? "")?.location ?? "Search"}</span>
                        <span className="text-xs text-slate-500">{ago(now - new Date(r.started_at).getTime())}</span>
                        <span className={`ml-auto text-xs font-semibold ${r.status === "ok" ? "text-green-700" : r.status === "running" ? "text-slate-500" : "text-red-700"}`}>
                          {r.status === "ok" ? `${r.found} new` : r.status}
                        </span>
                      </summary>
                      <ol className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                        {r.log.map((line, i) => <li key={i}>{line}</li>)}
                      </ol>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title={`Candidates to review (${candidates.length})`}>
          <div className="mb-4 flex items-center gap-3">
            <label htmlFor="cand-job" className="sr-only">Filter by search</label>
            <select id="cand-job" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className={`${inputClass} !w-auto`}>
              <option value="">All searches</option>
              {jobsQ.data.map((j) => <option key={j.id} value={j.id}>{j.location}</option>)}
            </select>
          </div>
          {candidates.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No candidates waiting. Run a search to find businesses.</p>
          ) : (
            <ul className="space-y-3">
              {candidates.map((c) => {
                const site = safeUrl(c.website);
                const source = safeUrl(c.source_url);
                return (
                  <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                          {c.name}
                          {c.verified && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800"><BadgeCheck className="size-3.5" aria-hidden /> Verified</span>}
                          {c.emergency && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">24/7 emergency</span>}
                        </p>
                        <p className="text-sm text-slate-600">{[c.address, c.city, c.state, c.postal_code].filter(Boolean).join(", ") || "No address"}</p>
                        <p className="mt-0.5 text-sm text-slate-600">{c.phone ?? "No phone"}</p>
                        {c.services.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {c.services.map((s) => <li key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</li>)}
                          </ul>
                        )}
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {site ? <a href={site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Website <ExternalLink className="size-3.5" aria-hidden /></a> : <span className="text-slate-400">No website listed</span>}
                          {source && source !== site && <a href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Source <ExternalLink className="size-3.5" aria-hidden /></a>}
                        </p>
                        {c.notes && <p className="mt-2 text-xs text-slate-500">{c.notes}</p>}
                      </div>
                      <div className="text-right text-xs text-slate-500" title="How well the details are confirmed">
                        <p className="text-lg font-bold text-navy">{c.confidence}%</p>
                        <p>{c.origin === "osm" ? "OpenStreetMap" : "Web search"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button onClick={() => importCandidate(c)} disabled={busyId === c.id} className="!rounded-full !px-4 !py-1.5 text-sm"><Plus className="size-4" aria-hidden /> Import as pending</Button>
                      <Button variant="secondary" onClick={() => reject(c)} disabled={busyId === c.id} className="!rounded-full !px-4 !py-1.5 text-sm"><X className="size-4" aria-hidden /> Reject</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
