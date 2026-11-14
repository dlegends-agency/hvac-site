// Reads SAM.gov's public daily file of federal contract opportunities, keeps the open Texas HVAC notices and saves them to the
// `gov_bids` table (Admin > Government bids, and Opportunities in the contractor dashboard).
// SAM.gov is the federal government's contracting site. The file is the government's own open-data extract (about 220 MB, updated every
// night, no key needed). It is read as a stream and never saved to disk.
//
//   node scripts/bids/index.mjs --dry-run           print what would be saved (needs no database)
//   node scripts/bids/index.mjs                     save the open Texas HVAC notices
//   node scripts/bids/index.mjs --state TX          another state (two letters)
//   node scripts/bids/index.mjs --file path.csv     read a downloaded copy instead (for testing)
// Saving needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Notices that are no longer open are removed on each run.

import { createReadStream } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { columnIndex, mapBid } from "./classify.mjs";
import { csvRows } from "./csv.mjs";

const FILE_URL = "https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv";
const UA = "HVACHelpBot/1.0 (business directory research)";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");
const state = (arg("state") ?? "TX").toUpperCase();
const file = arg("file");

async function source() {
  if (file) return createReadStream(file);
  const res = await fetch(FILE_URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`SAM.gov file answered ${res.status}`);
  return res.body;
}

const started = Date.now();
let scanned = 0;
const bids = new Map();
try {
  let cols = null;
  for await (const row of csvRows(await source())) {
    if (!cols) {
      cols = columnIndex(row);
      const missing = Object.entries(cols).filter(([, i]) => i < 0).map(([n]) => n);
      if (missing.length > 8) throw new Error(`The file's columns changed (missing ${missing.slice(0, 5).join(", ")}...)`);
      continue;
    }
    scanned++;
    const bid = mapBid(row, cols, { state });
    if (bid?.notice_id) bids.set(bid.notice_id, bid);
  }
} catch (e) {
  console.error(`Could not read the SAM.gov file: ${e.message}`);
  process.exit(1);
}
// The same notice is often posted several times (new ids for amendments and re-postings): keep the newest of each.
const newestFirst = [...bids.values()].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
const seenKeys = new Set();
const list = newestFirst.filter((b) => {
  const key = [(b.solicitation_number ?? b.title).toLowerCase(), (b.city ?? "").toLowerCase(), (b.agency ?? "").toLowerCase()].join("|");
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
});
console.log(`Read ${scanned.toLocaleString("en-US")} notices in ${Math.round((Date.now() - started) / 1000)}s: ${list.length} open ${state} HVAC notices${newestFirst.length > list.length ? ` (${newestFirst.length - list.length} repeats of the same notice left out)` : ""}.`);

if (dryRun) {
  for (const b of list.slice(0, 15)) console.log(`- ${b.posted_at?.slice(0, 10)} | due ${b.response_due?.slice(0, 10) ?? "none"} | ${b.notice_type} | NAICS ${b.naics ?? "-"} | ${b.relevance}\n    ${b.summary}\n    ${b.sam_url ?? ""}`);
  console.log(`\nDry run: nothing saved.`);
  process.exit(0);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("\nSet SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to save (or use --dry-run).");
  process.exit(1);
}
if (scanned < 1000) {
  console.error(`Only ${scanned} notices were read, which looks wrong, so nothing was changed.`);
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
for (let i = 0; i < list.length; i += 200) {
  const { error } = await sb.from("gov_bids").upsert(list.slice(i, i + 200), { onConflict: "notice_id" });
  if (error) {
    console.error(`Could not save: ${error.message}`);
    process.exit(1);
  }
}
// Notices that closed, were cancelled or moved on are no longer in the open set: remove them.
const keep = new Set(list.map((b) => b.notice_id));
const { data: existing, error: readError } = await sb.from("gov_bids").select("notice_id").eq("state", state).limit(20000);
if (readError) console.error(`Could not check for closed notices: ${readError.message}`);
const stale = (existing ?? []).map((r) => r.notice_id).filter((id) => !keep.has(id));
for (let i = 0; i < stale.length; i += 100) await sb.from("gov_bids").delete().in("notice_id", stale.slice(i, i + 100));
console.log(`Saved ${list.length} open ${state} HVAC notices${stale.length ? `, removed ${stale.length} that closed` : ""}. See them in Admin > Government bids.`);
