// Run by the scrape workflows before anything else: decides whether this scrape should run now, using the schedule saved in
// Admin > Schedule. Usage: node scripts/schedule/due.mjs permits|bids
// Writes run=true or run=false (and started=<time>) to the GitHub output file. Needs no npm install: only Node and fetch.
// A manual run (Actions > Run workflow) always runs. If the schedule table does not exist yet (the SQL has not been run) the old fixed
// daily time is used (permits 8:00 AM, bids 8:30 AM Philippine time) so nothing stops working.
import { appendFileSync } from "node:fs";
import { PH_OFFSET_MS, describe, isDue } from "./logic.mjs";

const source = process.argv[2];
const FALLBACK = { permits: { hour: 8, minute: 0 }, bids: { hour: 8, minute: 30 } };
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVENT_NAME, GITHUB_OUTPUT } = process.env;
const out = (run) => {
  const started = new Date().toISOString();
  console.log(`run=${run}, started=${started}`);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `run=${run}\nstarted=${started}\n`);
};

if (!FALLBACK[source]) {
  console.error("Usage: node scripts/schedule/due.mjs permits|bids");
  process.exit(1);
}
if (EVENT_NAME === "workflow_dispatch") {
  console.log("Started by hand: running.");
  out(true);
  process.exit(0);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log("No Supabase secrets: not running.");
  out(false);
  process.exit(0);
}

let schedule = null;
try {
  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/scrape_schedules?source=eq.${source}&select=*&limit=1`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (res.ok) schedule = (await res.json())[0] ?? null;
  else console.log(`Could not read the schedule (HTTP ${res.status}). Has supabase/schema-schedule.sql been run?`);
} catch (e) {
  console.log(`Could not read the schedule: ${e.message}`);
}

const now = Date.now();
if (!schedule) {
  // No saved schedule: run during the first 30 minutes after the old fixed daily time.
  const ph = new Date(now + PH_OFFSET_MS);
  const minutes = ph.getUTCHours() * 60 + ph.getUTCMinutes();
  const start = FALLBACK[source].hour * 60 + FALLBACK[source].minute;
  const run = minutes >= start && minutes < start + 30;
  console.log(`No saved schedule; using the fixed daily time: ${run ? "running" : "not now"}.`);
  out(run);
} else {
  const due = isDue(schedule, now);
  console.log(`Schedule: ${describe(schedule)}${schedule.run_requested ? " (run requested)" : ""}. Last run: ${schedule.last_run_at ?? "never"}. ${due ? "Due: running." : "Not due."}`);
  out(due);
}
