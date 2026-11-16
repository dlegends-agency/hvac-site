// Scrape schedules for the two lead sources (Admin > Schedule). The same rules as scripts/schedule/logic.mjs, which the GitHub workflows use
// to decide whether a scrape is due; scripts/schedule/test.mjs checks the two agree. Times are Philippine time (UTC+8, no daylight saving).

export type ScheduleSource = "permits" | "bids";
export type Frequency = "off" | "hourly" | "daily" | "weekly";

export interface ScrapeSchedule {
  source: ScheduleSource;
  frequency: Frequency;
  /** For "hourly": run every this many hours (1 to 24). */
  every_hours: number;
  /** For "weekly": 1 = Monday ... 7 = Sunday. */
  weekday: number;
  /** For "daily" and "weekly": the start time in Philippine time. */
  hour: number;
  minute: number;
  last_run_at: string | null;
  last_status: "success" | "failed" | "cancelled" | null;
  last_run_url: string | null;
  /** Set when "Run now" could not start the scrape directly: the next check (within 30 minutes) runs it. */
  run_requested: boolean;
}

export const SOURCE_LABEL: Record<ScheduleSource, string> = { permits: "Building permits", bids: "Government bids" };
export const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const PH_OFFSET_MS = 8 * 3_600_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SLACK_MS = 10 * 60_000;

type Rules = Pick<ScrapeSchedule, "frequency" | "every_hours" | "weekday" | "hour" | "minute" | "last_run_at" | "run_requested">;

/** The most recent time a daily or weekly schedule was supposed to start, at or before `nowMs`. */
export function lastScheduledAt(s: Rules, nowMs: number): number {
  const ph = new Date(nowMs + PH_OFFSET_MS);
  const midnightPh = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate()) - PH_OFFSET_MS;
  const todayAt = midnightPh + s.hour * HOUR + s.minute * 60_000;
  if (s.frequency === "daily") return todayAt > nowMs ? todayAt - DAY : todayAt;
  const phWeekday = ph.getUTCDay() === 0 ? 7 : ph.getUTCDay();
  let at = todayAt - ((phWeekday - s.weekday + 7) % 7) * DAY;
  if (at > nowMs) at -= 7 * DAY;
  return at;
}

export function isDue(s: Rules, nowMs = Date.now()): boolean {
  if (s.run_requested) return true;
  if (s.frequency === "off") return false;
  const last = s.last_run_at ? new Date(s.last_run_at).getTime() : null;
  if (last === null) return true;
  if (s.frequency === "hourly") return nowMs - last >= Math.max(1, s.every_hours) * HOUR - SLACK_MS;
  return last < lastScheduledAt(s, nowMs);
}

/** When the next scheduled run should start, or null when the schedule is off. A run that is due now returns `nowMs`. */
export function nextRunAt(s: Rules, nowMs = Date.now()): number | null {
  if (s.frequency === "off") return null;
  const last = s.last_run_at ? new Date(s.last_run_at).getTime() : null;
  if (s.frequency === "hourly") return last === null ? nowMs : Math.max(nowMs, last + Math.max(1, s.every_hours) * HOUR);
  const prev = lastScheduledAt(s, nowMs);
  if (last === null || last < prev) return nowMs;
  return prev + (s.frequency === "daily" ? DAY : 7 * DAY);
}

export function timeText(hour: number, minute: number): string {
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** A plain-words name for the schedule, for example "Every Monday at 8:00 AM Philippine time". */
export function describe(s: Pick<ScrapeSchedule, "frequency" | "every_hours" | "weekday" | "hour" | "minute">): string {
  if (s.frequency === "off") return "Off";
  if (s.frequency === "hourly") return s.every_hours === 1 ? "Every hour" : `Every ${s.every_hours} hours`;
  const at = `${timeText(s.hour, s.minute)} Philippine time`;
  return s.frequency === "daily" ? `Every day at ${at}` : `Every ${WEEKDAYS[s.weekday]} at ${at}`;
}

/** The defaults, used before the SQL has been run: daily, permits at 8:00 AM and bids at 8:30 AM Philippine time. */
export const DEFAULT_SCHEDULE: Record<ScheduleSource, ScrapeSchedule> = {
  permits: { source: "permits", frequency: "daily", every_hours: 1, weekday: 1, hour: 8, minute: 0, last_run_at: null, last_status: null, last_run_url: null, run_requested: false },
  bids: { source: "bids", frequency: "daily", every_hours: 1, weekday: 1, hour: 8, minute: 30, last_run_at: null, last_status: null, last_run_url: null, run_requested: false },
};
