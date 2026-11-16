// When is a scrape due? The admin sets a schedule per lead source (Admin > Schedule); GitHub runs a check every 30 minutes and starts the
// scrape only when this says it is due. Times are Philippine time (UTC+8, no daylight saving). Plain arithmetic, no libraries.
//
// schedule: { frequency: "off" | "hourly" | "daily" | "weekly", every_hours, weekday (1 = Monday ... 7 = Sunday), hour (0-23), minute (0 or 30),
//             last_run_at (ISO or null), run_requested (true when "Run now" could not start it directly) }
// A daily or weekly schedule catches up: if its time has passed and it has not run since, it is due, so a late or skipped check never loses a run.
// src/lib/schedule.ts is the same logic for the admin page; scripts/schedule/test.mjs checks the two agree.

export const PH_OFFSET_MS = 8 * 3_600_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Allow a run to start a little early so an hourly schedule does not slip by a whole check each time. */
const SLACK_MS = 10 * 60_000;

/** The most recent time the daily or weekly schedule was supposed to start, at or before `nowMs` (UTC ms). */
export function lastScheduledAt(s, nowMs) {
  const ph = new Date(nowMs + PH_OFFSET_MS);
  const midnightPh = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate()) - PH_OFFSET_MS;
  const todayAt = midnightPh + (s.hour ?? 0) * HOUR + (s.minute ?? 0) * 60_000;
  if (s.frequency === "daily") return todayAt > nowMs ? todayAt - DAY : todayAt;
  const phWeekday = ph.getUTCDay() === 0 ? 7 : ph.getUTCDay(); // 1 = Monday ... 7 = Sunday
  let at = todayAt - ((phWeekday - (s.weekday ?? 1) + 7) % 7) * DAY;
  if (at > nowMs) at -= 7 * DAY;
  return at;
}

/** True when the scrape should start now. */
export function isDue(s, nowMs = Date.now()) {
  if (!s) return false;
  if (s.run_requested) return true;
  if (s.frequency === "off") return false;
  const last = s.last_run_at ? new Date(s.last_run_at).getTime() : null;
  if (last === null) return true; // never run: run once now, then follow the schedule
  if (s.frequency === "hourly") return nowMs - last >= Math.max(1, s.every_hours ?? 1) * HOUR - SLACK_MS;
  if (s.frequency === "daily" || s.frequency === "weekly") return last < lastScheduledAt(s, nowMs);
  return false;
}

/** When the next scheduled run should start (UTC ms), or null when the schedule is off. A run that is due now returns `nowMs`. */
export function nextRunAt(s, nowMs = Date.now()) {
  if (!s || s.frequency === "off") return null;
  const last = s.last_run_at ? new Date(s.last_run_at).getTime() : null;
  if (s.frequency === "hourly") return last === null ? nowMs : Math.max(nowMs, last + Math.max(1, s.every_hours ?? 1) * HOUR);
  const prev = lastScheduledAt(s, nowMs);
  if (last === null || last < prev) return nowMs;
  return prev + (s.frequency === "daily" ? DAY : 7 * DAY);
}

/** A plain-words name for the schedule, for example "Every Monday at 8:00 AM Philippine time". */
export function describe(s) {
  const h = s.hour ?? 0;
  const time = `${((h + 11) % 12) + 1}:${String(s.minute ?? 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} Philippine time`;
  const days = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (s.frequency === "off") return "Off";
  if (s.frequency === "hourly") return (s.every_hours ?? 1) === 1 ? "Every hour" : `Every ${s.every_hours} hours`;
  if (s.frequency === "daily") return `Every day at ${time}`;
  return `Every ${days[s.weekday ?? 1]} at ${time}`;
}
