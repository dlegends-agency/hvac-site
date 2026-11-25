// Statewide Texas export. Searches Google Business listings (official Places API) city by city, reads each business's own
// website for a public email, and writes a CSV. No database needed.
//   node scripts/discovery-agent/texas.mjs [--cities 25] [--queries "..."] [--no-email] [--all] [--out file.csv]  (key from env or .env)
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Loads GOOGLE_PLACES_API_KEY from .env (never committed) when it is not already in the environment.
if (!process.env.GOOGLE_PLACES_API_KEY && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
import { findGoogle } from "./sources.mjs";
import { readSite } from "./site.mjs";
import { hostOf, mapConcurrent, phoneDigits } from "./util.mjs";

// Largest Texas metros and cities first, so --cities N takes the biggest N.
export const TEXAS_CITIES = [
  "Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington", "Corpus Christi", "Plano", "Lubbock", "Laredo", "Irving",
  "Garland", "Frisco", "McKinney", "Amarillo", "Grand Prairie", "Brownsville", "Killeen", "Pasadena", "Mesquite", "McAllen", "Denton", "Waco",
  "Carrollton", "Midland", "Odessa", "Round Rock", "Richardson", "Abilene", "Tyler", "Beaumont", "College Station", "Pearland", "Lewisville",
  "League City", "Sugar Land", "Wichita Falls", "Allen", "San Angelo", "Edinburg", "Mission", "Conroe", "Bryan", "Longview", "Pharr", "Baytown",
  "Temple", "Missouri City", "Flower Mound", "New Braunfels", "North Richland Hill", "Cedar Park", "Georgetown", "San Marcos", "Victoria", "Harlingen",
  "Galveston", "Texarkana", "Kyle", "The Woodlands", "Katy", "Spring", "Cypress", "Humble", "Kingwood", "Lufkin", "Nacogdoches", "Paris", "Sherman",
];

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** A hung request must not stall the whole run: give up on it after ms and move on. */
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms))]);

const key = process.env.GOOGLE_PLACES_API_KEY;
if (!key) { console.error("Set GOOGLE_PLACES_API_KEY (Google Cloud > Places API (New), billing enabled)."); process.exit(1); }

const cities = TEXAS_CITIES.slice(0, Number(arg("cities", TEXAS_CITIES.length)));
const queries = arg("queries", "HVAC contractor").split(",").map((s) => s.trim()).filter(Boolean);
const out = arg("out", "texas-hvac-contractors.csv");
const byId = new Map();

for (const city of cities) {
  for (const q of queries) {
    try {
      const leads = await withTimeout(findGoogle(`${city}, TX`, q, key, 60), 90_000);
      let added = 0;
      for (const l of leads) {
        if (l.state && l.state !== "Texas") continue;
        if (!byId.has(l.externalId)) { byId.set(l.externalId, l); added++; }
      }
      console.log(`${city} / "${q}": ${leads.length} found, ${added} new (total ${byId.size})`);
    } catch (e) {
      console.error(`${city} / "${q}" failed: ${e.message}`);
    }
  }
}

// Same business can appear under different place ids (e.g. service-area listings): collapse by website host, else by phone.
const seen = new Set();
const rows = [...byId.values()].filter((l) => {
  const k = hostOf(l.website ?? "") ? `h:${hostOf(l.website)}` : phoneDigits(l.phone) ? `p:${phoneDigits(l.phone)}` : l.externalId;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (!process.argv.includes("--no-email")) {
  console.log(`Reading ${rows.filter((r) => r.website).length} business websites for public emails (robots.txt respected)...`);
  let done = 0;
  await mapConcurrent(rows, 3, async (l) => {
    if (!l.website) return;
    const site = await withTimeout(readSite(l.website), 60_000).catch(() => null);
    if (++done % 100 === 0) console.log(`  read ${done} websites, ${rows.filter((r) => r.email).length} emails so far`);
    if (site?.ok) { l.email = site.email ?? null; l.services = site.services ?? []; }
  });
}

const total = rows.length;
const withPhone = rows.filter((r) => r.phone).length;
const withEmail = rows.filter((r) => r.email).length;
const complete = rows.filter((r) => r.phone && r.email);
console.log(`\nTexas HVAC businesses found: ${total}\n  with phone: ${withPhone}\n  with email: ${withEmail}\n  with phone AND email: ${complete.length}`);
if (!process.argv.includes("--all")) { rows.length = 0; rows.push(...complete); }

const head = ["Company name", "Address", "City", "State", "ZIP", "Phone", "Email", "Website", "Service category", "Services (from website)", "Google Maps URL"];
const lines = [head.map(csvCell).join(",")];
for (const l of rows.sort((a, b) => (a.city ?? "").localeCompare(b.city ?? "") || a.name.localeCompare(b.name))) {
  lines.push([l.name, l.street, l.city, l.state, l.postal_code, l.phone, l.email, l.website, l.category, (l.services ?? []).join("; "), l.mapsUrl].map(csvCell).join(","));
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(`Wrote ${rows.length} businesses${process.argv.includes("--all") ? "" : " (phone and email only; use --all to keep the rest)"} to ${out}`);
