// One-time setup: loads US ZIP code locations into Supabase so new leads can be matched to contractors who work nearby.
// Data: US Census Bureau ZIP Code Tabulation Area centroids (public domain), in supabase/data/zip-centroids.csv.gz.
// Run it from GitHub (Actions > Load ZIP code data > Run workflow) or locally:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/load-zip-centroids.mjs
// Safe to run again: existing ZIP codes are updated, nothing is duplicated.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const lines = gunzipSync(readFileSync(new URL("../supabase/data/zip-centroids.csv.gz", import.meta.url))).toString("utf8").trim().split("\n");
const rows = lines
  .slice(1)
  .map((l) => l.split(","))
  .filter(([zip, lat, lng]) => /^\d{5}$/.test(zip) && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)))
  .map(([zip, lat, lng]) => ({ zip, lat: Number(lat), lng: Number(lng) }));
console.log(`Loading ${rows.length} ZIP codes...`);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const BATCH = 1000;
for (let i = 0; i < rows.length; i += BATCH) {
  const { error } = await sb.from("zip_centroids").upsert(rows.slice(i, i + BATCH), { onConflict: "zip" });
  if (error) {
    console.error(`Failed at row ${i}: ${error.message}. Have you run the latest supabase/schema-contractors.sql?`);
    process.exit(1);
  }
}
const { count } = await sb.from("zip_centroids").select("*", { count: "exact", head: true });
console.log(`Done. The table now has ${count} ZIP codes.`);
