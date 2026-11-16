import { useLiveQuery } from "./admin-hooks";
import { DEFAULT_SCHEDULE, describe, type ScheduleSource, type ScrapeSchedule } from "./schedule";
import { getSupabaseBrowser } from "./supabase";

/** The saved schedule of one lead source, as plain words ("Every Monday at 8:00 AM Philippine time"). Falls back to the old fixed time until the SQL has been run. */
export function useScheduleText(source: ScheduleSource): string {
  const q = useLiveQuery<ScrapeSchedule[]>([], () => getSupabaseBrowser().from("scrape_schedules").select("*").eq("source", source), { key: `schedule-${source}`, intervalMs: 300_000 });
  return describe(q.data[0] ?? DEFAULT_SCHEDULE[source]);
}
