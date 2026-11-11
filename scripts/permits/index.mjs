// Pulls recent public HVAC permits (heating, cooling and ventilation only) from city open-data portals, names the trade, reads the
// project value, marks residential or commercial and writes a one-line summary, then saves them to the `public_permits` table.
// Admin > Permits ranks them Hot, Warm and Cold. It runs every day at 8:00 AM Philippine time (see .github/workflows/permits-import.yml).
//
//   node scripts/permits/index.mjs --dry-run                       print what would be saved, ranked (needs no database)
//   node scripts/permits/index.mjs                                 save the HVAC permits of the last 30 days, up to 200 per city
//   node scripts/permits/index.mjs --days 14 --per-city 100        a shorter window, fewer permits
//   node scripts/permits/index.mjs --cities austin,dallas          only these cities
//   node scripts/permits/index.mjs --dry-run --served "Houston"    cities you serve, for the ranking in a dry run
// Saving needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The same permit is never saved twice, and anything that is not HVAC is removed.

import { createClient } from "@supabase/supabase-js";
import { SOURCES } from "./sources.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");
const limit = Math.max(1, Math.min(1000, Number(arg("per-city") ?? 200)));
const days = Math.max(1, Math.min(365, Number(arg("days") ?? 30)));
const cities = (arg("cities") ?? Object.keys(SOURCES).join(",")).split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const sb = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

const all = [];
for (const key of cities) {
  const source = SOURCES[key];
  if (!source) {
    console.error(`Unknown city "${key}". Available: ${Object.keys(SOURCES).join(", ")}.`);
    process.exit(1);
  }
  try {
    const permits = await source.fetch({ limit, days });
    console.log(`${source.label}: ${permits.length} HVAC permits from the last ${days} days.`);
    all.push(...permits);
  } catch (e) {
    console.error(`${source.label}: could not be read (${e.message}).`);
    process.exitCode = 1;
  }
}

if (dryRun) {
  // Rank them the way Admin > Permits does.
  const { scorePermit, TIERS } = await import("../../src/lib/permit-score.ts");
  let served = (arg("served") ?? "").split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (sb && !arg("served")) {
    const { data } = await sb.from("listings").select("city").eq("status", "published").limit(5000);
    served = [...new Set((data ?? []).map((l) => String(l.city).trim().toLowerCase()))];
  }
  const cover = { cities: new Set(served), stateCovered: true };
  const scored = all.map((p) => ({ p, s: scorePermit(p, cover) })).sort((a, b) => b.s.score - a.s.score);
  for (const tier of ["hot", "warm", "cold"]) {
    const group = scored.filter((x) => x.s.tier === tier);
    console.log(`\n=== ${TIERS[tier].label.toUpperCase()} (${TIERS[tier].hint}): ${group.length} ===`);
    for (const { p, s } of group.slice(0, 8)) console.log(`${String(s.score).padStart(3)} | ${p.city} | ${p.issued_on} | ${p.value_usd ?? "no value"} | ${p.property_class} | ${p.summary}\n      why: ${s.why}`);
  }
  console.log(`\nDry run: ${all.length} permits, nothing saved.`);
  process.exit(process.exitCode ?? 0);
}

if (!sb) {
  console.error("\nSet SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to save (or use --dry-run).");
  process.exit(1);
}
for (let i = 0; i < all.length; i += 500) {
  const { error } = await sb.from("public_permits").upsert(all.slice(i, i + 500), { onConflict: "source,source_id" });
  if (error) {
    console.error(`Could not save: ${error.message}`);
    process.exit(1);
  }
}
// Only HVAC is kept: remove anything else that an earlier run saved.
const removed = await sb.from("public_permits").delete({ count: "exact" }).neq("trade", "HVAC");
if (removed.error) console.error(`Could not remove non-HVAC permits: ${removed.error.message}`);
console.log(`\nSaved ${all.length} HVAC permits${removed.count ? `, removed ${removed.count} that were not HVAC` : ""}. See them in Admin > Permits.`);
process.exit(process.exitCode ?? 0);
