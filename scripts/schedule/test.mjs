// Offline tests for the scrape schedules. Run: npm run schedule:test
import assert from "node:assert/strict";
import { describe, isDue, lastScheduledAt, nextRunAt } from "./logic.mjs";
import * as web from "../../src/lib/schedule.ts";

// Philippine time to a real moment: ph(2026, 11, 16, 8, 0) is Monday 16 November 2026, 8:00 AM in Manila.
const ph = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - 8 * 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const base = { frequency: "daily", every_hours: 1, weekday: 1, hour: 8, minute: 0, last_run_at: null, run_requested: false };
const at = (s, now, last = null) => isDue({ ...s, last_run_at: last === null ? null : iso(last) }, now);
// 16 November 2026 is a Monday.

// ---- daily
const daily = { ...base, frequency: "daily", hour: 8, minute: 0 };
assert.equal(at(daily, ph(2026, 11, 16, 7, 59), ph(2026, 11, 15, 8, 5)), false, "not yet 8:00 today, and it ran yesterday");
assert.equal(at(daily, ph(2026, 11, 16, 8, 0), ph(2026, 11, 15, 8, 5)), true, "8:00 has come and it has not run today");
assert.equal(at(daily, ph(2026, 11, 16, 12, 0), ph(2026, 11, 16, 8, 10)), false, "already ran after 8:00 today");
assert.equal(at(daily, ph(2026, 11, 16, 15, 0), ph(2026, 11, 14, 8, 5)), true, "it catches up when a day was missed");
assert.equal(at({ ...daily, hour: 20, minute: 30 }, ph(2026, 11, 16, 20, 29), ph(2026, 11, 15, 20, 31)), false);
assert.equal(at({ ...daily, hour: 20, minute: 30 }, ph(2026, 11, 16, 20, 30), ph(2026, 11, 15, 20, 31)), true, "8:30 PM works too");
assert.equal(at(daily, ph(2026, 11, 16, 8, 30), null), true, "a schedule that never ran runs once straight away");

// ---- weekly
const weekly = { ...base, frequency: "weekly", weekday: 1, hour: 8, minute: 0 }; // every Monday 8:00 AM
assert.equal(at(weekly, ph(2026, 11, 16, 9, 0), ph(2026, 11, 9, 8, 10)), true, "Monday 9:00, last ran a week ago");
assert.equal(at(weekly, ph(2026, 11, 17, 9, 0), ph(2026, 11, 16, 8, 10)), false, "Tuesday, it ran Monday");
assert.equal(at(weekly, ph(2026, 11, 22, 23, 0), ph(2026, 11, 16, 8, 10)), false, "Sunday night, it ran this week");
assert.equal(at(weekly, ph(2026, 11, 23, 8, 0), ph(2026, 11, 16, 8, 10)), true, "the next Monday 8:00");
assert.equal(at(weekly, ph(2026, 11, 20, 12, 0), ph(2026, 11, 2, 8, 0)), true, "a missed Monday is caught up");
assert.equal(at(weekly, ph(2026, 11, 16, 1, 0), ph(2026, 11, 9, 8, 10)), false, "Monday 1:00 AM in Manila (still Sunday in UTC) is before 8:00");
assert.equal(lastScheduledAt(weekly, ph(2026, 11, 16, 1, 0)), ph(2026, 11, 9, 8, 0), "the last Monday 8:00, a week back");
assert.equal(lastScheduledAt({ ...weekly, weekday: 7 }, ph(2026, 11, 16, 9, 0)), ph(2026, 11, 15, 8, 0), "Sunday is 7");
assert.equal(lastScheduledAt(daily, ph(2026, 11, 16, 7, 0)), ph(2026, 11, 15, 8, 0));

// ---- hourly
const hourly = { ...base, frequency: "hourly", every_hours: 1 };
assert.equal(at(hourly, ph(2026, 11, 16, 10, 0), ph(2026, 11, 16, 9, 5)), true, "every hour: 55 minutes later is due (a little slack)");
assert.equal(at(hourly, ph(2026, 11, 16, 10, 0), ph(2026, 11, 16, 9, 30)), false, "30 minutes later is not");
assert.equal(at({ ...hourly, every_hours: 3 }, ph(2026, 11, 16, 12, 0), ph(2026, 11, 16, 10, 10)), false);
assert.equal(at({ ...hourly, every_hours: 3 }, ph(2026, 11, 16, 13, 10), ph(2026, 11, 16, 10, 10)), true);

// ---- off and "run now"
assert.equal(at({ ...daily, frequency: "off" }, ph(2026, 11, 16, 8, 30), null), false, "off never runs");
assert.equal(isDue({ ...daily, frequency: "off", run_requested: true }, ph(2026, 11, 16, 8, 30)), true, "but Run now still works");
assert.equal(isDue({ ...daily, last_run_at: iso(ph(2026, 11, 16, 8, 5)), run_requested: true }, ph(2026, 11, 16, 9, 0)), true);
assert.equal(isDue(null, 0), false);

// ---- next run
const lastMon = iso(ph(2026, 11, 16, 8, 10));
assert.equal(nextRunAt({ ...weekly, last_run_at: lastMon }, ph(2026, 11, 17, 9, 0)), ph(2026, 11, 23, 8, 0), "next Monday 8:00");
assert.equal(nextRunAt({ ...daily, last_run_at: lastMon }, ph(2026, 11, 16, 12, 0)), ph(2026, 11, 17, 8, 0), "tomorrow 8:00");
assert.equal(nextRunAt({ ...hourly, every_hours: 6, last_run_at: lastMon }, ph(2026, 11, 16, 9, 0)), ph(2026, 11, 16, 14, 10));
assert.equal(nextRunAt({ ...daily, frequency: "off" }, 0), null);
assert.equal(nextRunAt({ ...daily, last_run_at: null }, 12345), 12345, "never run: due now");

// ---- wording
assert.equal(describe(weekly), "Every Monday at 8:00 AM Philippine time");
assert.equal(describe({ ...daily, hour: 20, minute: 30 }), "Every day at 8:30 PM Philippine time");
assert.equal(describe({ ...daily, hour: 0, minute: 0 }), "Every day at 12:00 AM Philippine time");
assert.equal(describe({ ...hourly, every_hours: 1 }), "Every hour");
assert.equal(describe({ ...hourly, every_hours: 6 }), "Every 6 hours");
assert.equal(describe({ ...daily, frequency: "off" }), "Off");

// ---- the website and the workflows use the same rules
let seed = 12345;
const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
for (let i = 0; i < 2000; i++) {
  const s = {
    frequency: ["off", "hourly", "daily", "weekly"][rnd(4)], every_hours: 1 + rnd(24), weekday: 1 + rnd(7), hour: rnd(24), minute: rnd(2) * 30,
    last_run_at: rnd(5) === 0 ? null : iso(ph(2026, 11, 1) + rnd(30 * 24 * 60) * 60_000), run_requested: rnd(10) === 0,
  };
  const now = ph(2026, 11, 1) + rnd(35 * 24 * 60) * 60_000;
  assert.equal(web.isDue(s, now), isDue(s, now), `isDue agrees ${JSON.stringify(s)} ${now}`);
  assert.equal(web.nextRunAt(s, now), nextRunAt(s, now), `nextRunAt agrees ${JSON.stringify(s)} ${now}`);
  assert.equal(web.describe(s), describe(s), "describe agrees");
}

console.log("schedule: all checks passed");
