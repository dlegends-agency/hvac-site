// POST /api/cron/scrapes   (header: X-Notify-Secret)
// Starts the permits and government-bids scrapes that Admin > Schedule says are due. GitHub's own 30-minute timer is unreliable (it often
// skips hours), so a free outside timer such as cron-job.org calls this every 15 to 30 minutes instead. Safe to call as often as you like:
// a scrape that is not due, or is already running, is left alone. Needs NOTIFY_SECRET (the same secret the email alerts use), GITHUB_TOKEN,
// GITHUB_REPO and SUPABASE_SERVICE_ROLE_KEY.
import { isDue, type ScrapeSchedule } from "../../../src/lib/schedule";
import { secretsMatch } from "../../_lib/email";
import { db, json, type Env } from "../../_lib/stripe";

interface CronEnv extends Env {
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
}
const WORKFLOW = { permits: "permits-import.yml", bids: "bids-import.yml" } as const;
/** A run still marked "running" after this long is treated as stopped, so it never blocks the schedule for good. */
const STALE_MS = 90 * 60_000;

export const onRequestPost = async ({ env, request }: { env: CronEnv; request: Request }) => {
  if (!env.NOTIFY_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: "Scheduling is not configured" }, 501);
  if (!secretsMatch(request.headers.get("X-Notify-Secret"), env.NOTIFY_SECRET)) return json({ error: "Forbidden" }, 403);

  const sched = await db(env, "scrape_schedules?select=*");
  if (!sched.ok) return json({ error: "Could not read the schedule" }, 502);
  const schedules = (await sched.json()) as ScrapeSchedule[];
  const since = new Date(Date.now() - STALE_MS).toISOString();
  const running = await db(env, `scrape_runs?status=eq.running&started_at=gte.${encodeURIComponent(since)}&select=source`);
  const busy = new Set(running.ok ? ((await running.json()) as { source: string }[]).map((r) => r.source) : []);

  const result: Record<string, string> = {};
  for (const source of ["permits", "bids"] as const) {
    const s = schedules.find((r) => r.source === source);
    if (!s) result[source] = "no schedule";
    else if (busy.has(source)) result[source] = "already running";
    else if (!isDue(s)) result[source] = "not due";
    else {
      const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW[source]}/dispatches`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "hvac-site-cron", "X-Api-Version": "2022-11-28" },
        body: JSON.stringify({ ref: "main" }),
      });
      result[source] = res.ok ? "started" : `GitHub refused (${res.status})`;
    }
  }
  return json(result);
};
