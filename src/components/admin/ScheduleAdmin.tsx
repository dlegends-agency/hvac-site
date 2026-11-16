import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useLiveQuery, useNow } from "@/lib/admin-hooks";
import { DEFAULT_SCHEDULE, SOURCE_LABEL, WEEKDAYS, describe, nextRunAt, timeText, type Frequency, type ScheduleSource, type ScrapeSchedule } from "@/lib/schedule";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle, Panel } from "./widgets";

const HOURS = [1, 2, 3, 4, 6, 8, 12, 24];
const TIMES = Array.from({ length: 48 }, (_, i) => ({ hour: Math.floor(i / 2), minute: (i % 2) * 30 }));
const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "hourly", label: "Every few hours" },
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
];
const BLURB: Record<ScheduleSource, string> = {
  permits: "HVAC building permits from city open data (Austin and Dallas). The scrape also looks up each contractor's email, so it can take up to an hour.",
  bids: "Open federal HVAC notices in Texas from SAM.gov's public daily file. It takes about two minutes.",
};

const whenText = (ms: number, now: number) => {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return ms <= now + 60_000 ? "at the next check (within 30 minutes)" : `${day}, ${time} your time`;
};
const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} minutes ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} hours ago`;
  return `${Math.round(m / 1440)} days ago`;
};

function ScheduleCard({ saved, saveable, onSaved }: { saved: ScrapeSchedule; saveable: boolean; onSaved: () => void }) {
  const supabase = getSupabaseBrowser();
  const now = useNow(30_000);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Pick up a run that finished (new last-run details) without losing what is being edited.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the run history in step with the database
    setDraft((d) => ({ ...d, last_run_at: saved.last_run_at, last_status: saved.last_status, last_run_url: saved.last_run_url, run_requested: saved.run_requested }));
  }, [saved.last_run_at, saved.last_status, saved.last_run_url, saved.run_requested]);

  const dirty = (["frequency", "every_hours", "weekday", "hour", "minute"] as const).some((k) => draft[k] !== saved[k]);
  const patch = (p: Partial<ScrapeSchedule>) => setDraft((d) => ({ ...d, ...p }));
  const next = nextRunAt(saved, now);

  async function save() {
    setBusy("save");
    setMsg(null);
    const { error } = await supabase
      .from("scrape_schedules")
      .update({ frequency: draft.frequency, every_hours: draft.every_hours, weekday: draft.weekday, hour: draft.hour, minute: draft.minute, updated_at: new Date().toISOString() })
      .eq("source", saved.source);
    setBusy(null);
    if (error) return setMsg({ ok: false, text: "We couldn't save the schedule. Has supabase/schema-schedule.sql been run?" });
    setMsg({ ok: true, text: `Saved: ${describe(draft)}.` });
    onSaved();
  }

  async function runNow() {
    setBusy("run");
    setMsg(null);
    const { data } = await supabase.auth.getSession();
    let started = false;
    try {
      const res = await fetch("/api/run-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ source: saved.source }),
      });
      started = res.ok;
    } catch {
      started = false;
    }
    if (started) {
      setBusy(null);
      return setMsg({ ok: true, text: "Started. It is running on GitHub now; the result shows here when it finishes." });
    }
    // GitHub could not be started directly: ask for a run, which the next 30-minute check starts.
    const { error } = await supabase.from("scrape_schedules").update({ run_requested: true, updated_at: new Date().toISOString() }).eq("source", saved.source);
    setBusy(null);
    setMsg(error ? { ok: false, text: "We couldn't start it. Please try again." } : { ok: true, text: "Requested. It starts at the next check, within 30 minutes." });
    onSaved();
  }

  return (
    <Panel title={SOURCE_LABEL[saved.source]}>
      <p className="mb-4 text-sm text-slate-600">{BLURB[saved.source]}</p>

      <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold text-slate-500">Schedule</dt>
          <dd className="font-semibold text-navy">{describe(saved)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Last run</dt>
          <dd className="text-slate-800">
            {saved.last_run_at ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {saved.last_status === "success" ? <CheckCircle2 className="size-4 text-green-600" aria-hidden /> : <XCircle className="size-4 text-red-600" aria-hidden />}
                {ago(saved.last_run_at, now)}, {saved.last_status === "success" ? "worked" : saved.last_status === "cancelled" ? "was cancelled" : "failed"}
                {saved.last_run_url && <a href={saved.last_run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">log <ExternalLink className="size-3" aria-hidden /></a>}
              </span>
            ) : "Never"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Next run</dt>
          <dd className="text-slate-800">{saved.run_requested ? "Requested: at the next check" : next === null ? "Not scheduled" : whenText(next, now)}</dd>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${saved.source}-freq`} label="How often">
          {(a) => (
            <select id={`${saved.source}-freq`} value={draft.frequency} onChange={(e) => patch({ frequency: e.target.value as Frequency })} className={inputClass} {...a}>
              {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
        </Field>
        {draft.frequency === "hourly" && (
          <Field id={`${saved.source}-hours`} label="Run every">
            {(a) => (
              <select id={`${saved.source}-hours`} value={draft.every_hours} onChange={(e) => patch({ every_hours: Number(e.target.value) })} className={inputClass} {...a}>
                {HOURS.map((h) => <option key={h} value={h}>{h === 1 ? "1 hour" : `${h} hours`}</option>)}
              </select>
            )}
          </Field>
        )}
        {draft.frequency === "weekly" && (
          <Field id={`${saved.source}-day`} label="On">
            {(a) => (
              <select id={`${saved.source}-day`} value={draft.weekday} onChange={(e) => patch({ weekday: Number(e.target.value) })} className={inputClass} {...a}>
                {WEEKDAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            )}
          </Field>
        )}
        {(draft.frequency === "daily" || draft.frequency === "weekly") && (
          <Field id={`${saved.source}-time`} label="At (Philippine time)">
            {(a) => (
              <select id={`${saved.source}-time`} value={`${draft.hour}:${draft.minute}`} onChange={(e) => { const [hour, minute] = e.target.value.split(":").map(Number); patch({ hour, minute }); }} className={inputClass} {...a}>
                {TIMES.map((t) => <option key={`${t.hour}:${t.minute}`} value={`${t.hour}:${t.minute}`}>{timeText(t.hour, t.minute)}</option>)}
              </select>
            )}
          </Field>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-700">
        {dirty ? <>You are about to set it to: <strong>{describe(draft)}</strong>.</> : "Change the settings, then save."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!dirty || busy !== null || !saveable} className="!rounded-full !px-5 !py-2 text-sm">
          {busy === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />} Save schedule
        </Button>
        <Button variant="secondary" onClick={runNow} disabled={busy !== null || !saveable} className="!rounded-full !px-5 !py-2 text-sm">
          {busy === "run" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Run now
        </Button>
      </div>
      <div role="status">{msg && <p className={`mt-3 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
    </Panel>
  );
}

/** Admin > Schedule: when the permits and government-bids scrapes run. The schedule is saved in the database; GitHub checks it every 30 minutes. */
export function ScheduleAdmin() {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<ScrapeSchedule[]>([], () => supabase.from("scrape_schedules").select("*"), { key: "scrape-schedules", intervalMs: 60_000 });
  const bySource = (s: ScheduleSource) => q.data.find((r) => r.source === s) ?? DEFAULT_SCHEDULE[s];

  return (
    <>
      <PageTitle title="Schedule" description="Choose when each lead source is scraped: every few hours, every day or every week. Times are Philippine time. GitHub checks the schedule every 30 minutes, so a scrape starts within half an hour of its time." />
      {q.error && (
        <p className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          The schedule could not be loaded, so the old fixed times are in use (permits every day at 8:00 AM, bids every day at 8:30 AM). Run <code>supabase/schema-schedule.sql</code> in the Supabase SQL Editor to turn on scheduling from here.
        </p>
      )}
      <div className="grid w-full items-start gap-6 xl:grid-cols-2">
        {(["permits", "bids"] as const).map((s) => (
          <ScheduleCard key={s} saved={bySource(s)} saveable={!q.error && !q.loading} onSaved={() => void q.reload()} />
        ))}
      </div>
      <p className="mt-6 max-w-3xl text-xs text-slate-500">
        &quot;Run now&quot; starts the scrape on GitHub straight away (it needs <code>GITHUB_TOKEN</code> and <code>GITHUB_REPO</code> in Cloudflare, the same as Find businesses). Without them it asks for a run and the next check starts it.
        A schedule that has never run starts once at the next check, then follows its schedule. New leads are emailed to contractors in their daily summary at 10:00 AM Philippine time.
      </p>
    </>
  );
}
