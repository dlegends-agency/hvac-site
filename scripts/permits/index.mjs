// Pulls recent public building permits from city open-data portals, names the trade, reads the project value, marks residential or
// commercial and writes a one-line summary, then saves them to the `public_permits` table (Admin > Permits).
//
//   node scripts/permits/index.mjs --dry-run                 print what would be saved (needs no database)
//   node scripts/permits/index.mjs --per-city 10             save the 10 newest permits of each city
//   node scripts/permits/index.mjs --cities austin,dallas    only these cities
// Saving needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The same permit is never saved twice.

import { createClient } from "@supabase/supabase-js";
import { SOURCES } from "./sources.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");
const perCity = Math.max(1, Math.min(500, Number(arg("per-city") ?? 10)));
const cities = (arg("cities") ?? Object.keys(SOURCES).join(",")).split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);

const all = [];
for (const key of cities) {
  const source = SOURCES[key];
  if (!source) {
    console.error(`Unknown city "${key}". Available: ${Object.keys(SOURCES).join(", ")}.`);
    process.exit(1);
  }
  try {
    const permits = await source.fetch(perCity);
    console.log(`${source.label}: ${permits.length} permits read.`);
    all.push(...permits);
  } catch (e) {
    console.error(`${source.label}: could not be read (${e.message}).`);
    process.exitCode = 1;
  }
}

for (const p of all) console.log(`- [${p.city}] ${p.issued_on} | ${p.trade} | ${p.property_class} | ${p.value_usd ?? "n/a"} | ${p.summary}`);

if (dryRun) {
  console.log(`\nDry run: ${all.length} permits, nothing saved.`);
  process.exit(process.exitCode ?? 0);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("\nSet SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to save (or use --dry-run).");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await sb.from("public_permits").upsert(all, { onConflict: "source,source_id" });
if (error) {
  console.error(`Could not save: ${error.message}`);
  process.exit(1);
}
console.log(`\nSaved ${all.length} permits. See them in Admin > Permits.`);
