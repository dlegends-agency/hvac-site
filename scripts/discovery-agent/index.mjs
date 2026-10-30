// CLI entry. Usage:
//   node scripts/discovery-agent/index.mjs                         run every due job (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   node scripts/discovery-agent/index.mjs --job <uuid>            run one job now
//   node scripts/discovery-agent/index.mjs --dry-run --location "Austin, TX" [--max 10]   no database needed; prints what it would save

import { runJob } from "./agent.mjs";
import { buildKnown, createMemoryDb, createSupabaseDb } from "./db.mjs";
import { isDue } from "./util.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

const env = process.env;
const log = (m) => console.log(m);

if (flag("dry-run")) {
  const location = arg("location");
  if (!location) {
    console.error('Dry run needs --location "City, ST"');
    process.exit(1);
  }
  const job = { id: "dry-run", label: "dry run", query: arg("query") ?? "HVAC contractor", location, max_results: Number(arg("max") ?? 10) };
  const db = createMemoryDb({ jobs: [job], known: buildKnown({}) });
  await runJob(job, db, env, { log, dryRun: true });
  process.exit(0);
}

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see scripts/discovery-agent/README.md).");
  process.exit(1);
}

const db = createSupabaseDb(env);
const only = arg("job") ?? (env.JOB_ID || undefined);
const jobs = only ? [await db.getJob(only)].filter(Boolean) : (await db.listJobs()).filter((j) => isDue(j));
if (!jobs.length) {
  log(only ? `Job ${only} not found.` : "No jobs are due.");
  process.exit(0);
}
let failed = false;
for (const job of jobs) {
  log(`\n=== ${job.label} (${job.location}) ===`);
  const result = await runJob(job, db, env, { log });
  if (result.status !== "ok") failed = true;
}
process.exit(failed ? 1 : 0);
