// Government vendor discovery. Reads official vendor files, matches vendors to the bids and permits already collected, and imports the
// matches as UNCLAIMED directory listings (pending review). It never creates logins, plans or lead routing for a vendor.
//
//   node scripts/vendors/index.mjs --dry-run                          read the sources and print counts; saves nothing
//   node scripts/vendors/index.mjs                                    sync, match and import (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   node scripts/vendors/index.mjs --source cmbl,sba,sam              choose sources (default cmbl; sba needs --sba-file; sam needs SAM_API_KEY)
//   node scripts/vendors/index.mjs --sba-file sba-export.csv          import an SBA Small Business Search export you saved
//   node scripts/vendors/index.mjs --no-import                        sync and match only; do not create listings
//   VENDOR_AUTO_PUBLISH=1                                             import straight to "published" instead of "pending"
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadCmbl } from "./cmbl.mjs";
import { buildListingIndex, contentHash } from "./dedupe.mjs";
import { listable, refreshFields, vendorToListing } from "./listing.mjs";
import { matchVendors, MATCH_THRESHOLD } from "./match.mjs";
import { DEFAULT_MAP } from "./nigp.mjs";
import { fetchSam, importCsv } from "./sba.mjs";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const dryRun = process.argv.includes("--dry-run");
const noImport = process.argv.includes("--no-import");
const sources = (arg("source") ?? (arg("sba-file") ? "cmbl,sba" : "cmbl")).split(",").map((s) => s.trim());
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SAM_API_KEY, VENDOR_AUTO_PUBLISH } = process.env;
const sb = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
if (!sb && !dryRun) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run).");
  process.exit(1);
}
const writing = Boolean(sb) && !dryRun;
const log = (m) => console.log(m);
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function all(table, select, filter = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(sb.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
const must = ({ error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

async function startRun(source) {
  if (!writing) return null;
  const { data } = await sb.from("vendor_sync_runs").insert({ source }).select("id").single();
  return data?.id ?? null;
}
async function finishRun(id, patch, lines) {
  if (writing && id) await sb.from("vendor_sync_runs").update({ ...patch, finished_at: new Date().toISOString(), log: lines.slice(-150) }).eq("id", id);
}

/** Runs one stage, logging to vendor_sync_runs; a failed stage is recorded and the others still run. */
async function stage(source, fn) {
  const lines = [];
  const say = (m) => {
    lines.push(m);
    log(`[${source}] ${m}`);
  };
  const id = await startRun(source);
  const stats = { fetched: 0, inserted: 0, updated: 0, matched: 0, imported: 0, duplicates: 0 };
  let status = "ok";
  try {
    await fn(say, stats);
  } catch (e) {
    status = `error: ${e.message}`;
    say(`Failed: ${e.message}`);
    process.exitCode = 1;
  }
  await finishRun(id, { status, ...stats }, lines);
}

// 1. The NAICS -> NIGP map (admins can edit it in the database; the built-in copy is the fallback).
let map = DEFAULT_MAP;
if (sb) {
  const { data } = await sb.from("naics_nigp_map").select("naics,nigp_class,nigp_item,weight,note");
  if (data?.length) map = data;
}

// 2. Sync each source into gov_vendors.
async function syncVendors(source, vendors, say, stats) {
  stats.fetched = vendors.length;
  say(`${vendors.length} HVAC-relevant vendors read.`);
  if (!writing) return;
  const startedAt = new Date().toISOString();
  const existing = new Map((await all("gov_vendors", "id,source_id,content_hash", (q) => q.eq("source", source))).map((r) => [r.source_id, r]));
  const fresh = [];
  const changed = [];
  const same = [];
  for (const v of vendors) {
    const hash = contentHash(v);
    const row = { ...v, content_hash: hash, last_seen_at: new Date().toISOString(), active: true };
    const old = existing.get(v.source_id);
    if (!old) fresh.push(row);
    else if (old.content_hash !== hash) changed.push({ ...row, last_changed_at: new Date().toISOString() });
    else same.push(old.id);
  }
  for (const part of chunks([...fresh, ...changed], 500)) must(await sb.from("gov_vendors").upsert(part, { onConflict: "source,source_id" }), "save vendors");
  for (const part of chunks(same, 200)) must(await sb.from("gov_vendors").update({ last_seen_at: new Date().toISOString(), active: true }).in("id", part), "touch vendors");
  // Vendors that dropped out of the source file: keep the record (and any listing) but mark it inactive.
  if (source === "cmbl" && vendors.length > 500) must(await sb.from("gov_vendors").update({ active: false }).eq("source", source).lt("last_seen_at", startedAt), "retire vendors");
  stats.inserted = fresh.length;
  stats.updated = changed.length;
  say(`${fresh.length} new, ${changed.length} changed, ${same.length} unchanged.`);
}

if (sources.includes("cmbl")) await stage("cmbl", async (say, stats) => {
  const { vendors, total } = await loadCmbl(map, { log: say });
  say(`${total} active CMBL vendors in the Comptroller's file; ${vendors.length} are Texas HVAC contractors.`);
  await syncVendors("cmbl", vendors, say, stats);
});
if (sources.includes("sba") && arg("sba-file")) await stage("sba", async (say, stats) => {
  const { vendors, total } = await importCsv(readFileSync(arg("sba-file"), "utf8"), map);
  say(`${total} rows in the file; ${vendors.length} are Texas HVAC contractors.`);
  await syncVendors("sba", vendors, say, stats);
});
if (sources.includes("sam")) await stage("sam", async (say, stats) => {
  const { vendors, total, skipped } = await fetchSam(map, { apiKey: SAM_API_KEY, log: say });
  if (skipped) return say(`Skipped (${skipped}).`);
  say(`${total} SAM.gov registrations read.`);
  await syncVendors("sam", vendors, say, stats);
});

if (!sb) {
  log("No database connection: sources were read only. Matching and import need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(process.exitCode ?? 0);
}

// 3. Match vendors to open bids and recent permits.
let vendors = [];
await stage("match", async (say, stats) => {
  vendors = await all("gov_vendors", "*", (q) => q.eq("active", true).neq("status", "rejected"));
  const bids = await all("gov_bids", "id,naics,state,city,zip,set_aside_code,response_due", (q) => q.or(`response_due.is.null,response_due.gte.${new Date().toISOString()}`));
  const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const permits = await all("public_permits", "id,city,zip,issued_on", (q) => q.gte("issued_on", since));
  say(`${vendors.length} vendors, ${bids.length} open bids, ${permits.length} permits from the last 60 days.`);
  const rows = [];
  for (const b of bids) for (const m of matchVendors(vendors, { kind: "bid", naics: b.naics, state: b.state === "TX" ? "Texas" : b.state, city: b.city, zip: b.zip, setAsideCode: b.set_aside_code }, { map })) rows.push({ vendor_id: m.vendor.id, bid_id: b.id, score: m.score, reasons: m.reasons });
  for (const p of permits) for (const m of matchVendors(vendors, { kind: "permit", state: "Texas", city: p.city, zip: p.zip }, { map })) rows.push({ vendor_id: m.vendor.id, permit_id: p.id, score: m.score, reasons: m.reasons });
  stats.matched = rows.length;
  if (writing) {
    for (const part of chunks(rows.filter((r) => r.bid_id), 500)) must(await sb.from("vendor_matches").upsert(part, { onConflict: "vendor_id,bid_id" }), "save bid matches");
    for (const part of chunks(rows.filter((r) => r.permit_id), 500)) must(await sb.from("vendor_matches").upsert(part, { onConflict: "vendor_id,permit_id" }), "save permit matches");
  }
  say(`${rows.length} matches at score ${MATCH_THRESHOLD} or higher.`);
  const matchedIds = new Set(rows.map((r) => r.vendor_id));
  vendors = vendors.map((v) => ({ ...v, _matched: matchedIds.has(v.id) }));
});

// 4. Import matched vendors as unclaimed listings; refresh listings that are still unclaimed when the source changed.
if (!noImport) await stage("import", async (say, stats) => {
  const listings = await all("listings", "id,business_name,phone,email,website,city,unclaimed,source,vendor_synced_at");
  const index = buildListingIndex(listings);
  const byId = new Map(listings.map((l) => [l.id, l]));
  let created = 0;
  let merged = 0;
  let refreshed = 0;
  let skipped = 0;
  for (const v of vendors) {
    if (v.listing_id) {
      const l = byId.get(v.listing_id);
      if (l?.unclaimed && l.source === "vendor" && v.last_changed_at > (l.vendor_synced_at ?? "")) {
        if (writing) must(await sb.from("listings").update(refreshFields(v)).eq("id", l.id), "refresh listing");
        refreshed++;
      }
      continue;
    }
    if (!v._matched) continue;
    const dup = index.find(v);
    if (dup) {
      if (writing) must(await sb.from("gov_vendors").update({ listing_id: dup.id, status: "merged" }).eq("id", v.id), "link duplicate");
      merged++;
      continue;
    }
    if (!listable(v)) {
      skipped++;
      continue;
    }
    const id = randomUUID();
    const row = vendorToListing(v, id, { publish: VENDOR_AUTO_PUBLISH === "1" });
    if (writing) {
      must(await sb.from("listings").insert(row), "create listing");
      must(await sb.from("gov_vendors").update({ listing_id: id, status: "imported" }).eq("id", v.id), "link listing");
    }
    index.add({ ...row });
    created++;
  }
  stats.imported = created;
  stats.duplicates = merged;
  stats.updated = refreshed;
  say(`${created} unclaimed listings created (${VENDOR_AUTO_PUBLISH === "1" ? "published" : "pending review"}), ${merged} already in the directory (linked, not changed), ${refreshed} refreshed, ${skipped} skipped (no city or contact).`);
});
