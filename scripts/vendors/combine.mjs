// Builds ONE combined data set for Texas and matches it together. No database needed; writes CSV files.
//   node scripts/vendors/combine.mjs --google texas-hvac-contractors.csv --sam-file sam.csv --out texas-data
//        [--limit 1000] [--permit-days 365] [--bid-states TX,OK,LA,NM,AR] [--sba-file export.csv] [--no-permits]
// Inputs: local businesses (output of discovery-agent/texas.mjs), vendors (Texas CMBL official files, optional SBA export / SAM.gov),
// permits (city open-data portals), bids (SAM.gov's public daily file; --sam-file reads a saved copy).
// Outputs (CSV): local_businesses, gov_vendors, permits, bids, matches_vendor_bid, matches_business_bid, matches_business_permit,
// matches_vendor_permit, business_vendor_links, plus summary.txt.
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { csvRows } from "../bids/csv.mjs";
import { columnIndex, keepComplete as keepBids, mapBid } from "../bids/classify.mjs";
import { SOURCES } from "../permits/sources.mjs";
import { digits10, keepComplete as keepPermits } from "../permits/contacts.mjs";
import { loadCmbl } from "./cmbl.mjs";
import { enrichPermitContacts, linkBusinessesToVendors, matchBusinesses } from "./crossmatch.mjs";
import { matchVendors } from "./match.mjs";
import { DEFAULT_MAP } from "./nigp.mjs";
import { fetchSam, importCsv } from "./sba.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const out = arg("out", "texas-data");
const LIMIT = Number(arg("limit", 1000));
const bidStates = arg("bid-states", "TX,OK,LA,NM,AR").split(",");
mkdirSync(out, { recursive: true });
const cell = (v) => `"${String(Array.isArray(v) ? v.join("; ") : (v ?? "")).replace(/"/g, '""')}"`;
const writeCsv = (name, head, rows) => {
  writeFileSync(`${out}/${name}.csv`, [head.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n");
  return rows.length;
};
const lines = [];
const say = (m) => { lines.push(m); console.log(m); };

/** Spreads a list over cities in turn so the first N are statewide, not all Houston. */
function roundRobin(items, cityOf, n) {
  const groups = new Map();
  for (const it of items) { const k = cityOf(it) ?? ""; (groups.get(k) ?? groups.set(k, []).get(k)).push(it); }
  const out = [];
  while (out.length < n && [...groups.values()].some((g) => g.length)) for (const g of groups.values()) if (g.length && out.length < n) out.push(g.shift());
  return out;
}

// 1. Local businesses (Google), with phone and email.
let pool = [];
{
  let head = null;
  for await (const r of csvRows(createReadStream(arg("google", "texas-hvac-contractors.csv")))) {
    if (!head) { head = r; continue; }
    const o = Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""]));
    pool.push({ name: o["Company name"], address: o["Address"], city: o["City"], state: o["State"], postal_code: o["ZIP"], phone: o["Phone"], email: o["Email"], website: o["Website"], category: o["Service category"], services: o["Services (from website)"], maps_url: o["Google Maps URL"] });
  }
}
const withBoth = pool.filter((b) => b.phone && b.email);
const businesses = roundRobin(withBoth, (b) => b.city, LIMIT);
say(`Local businesses (Google): ${pool.length} in the file, ${withBoth.length} with phone and email, using ${businesses.length}.`);

// 2. Government vendors.
let vendors = [];
{
  const cmbl = await loadCmbl(DEFAULT_MAP, { log: () => {} });
  vendors = cmbl.vendors;
  if (arg("sba-file")) vendors.push(...(await importCsv(readFileSync(arg("sba-file"), "utf8"), DEFAULT_MAP)).vendors);
  if (process.env.SAM_API_KEY) vendors.push(...(await fetchSam(DEFAULT_MAP, { apiKey: process.env.SAM_API_KEY })).vendors);
  const seen = new Set();
  vendors = vendors.filter((v) => { const k = `${v.source}:${v.source_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  vendors.sort((a, b) => b.hvac_score - a.hvac_score);
  const total = vendors.length;
  vendors = roundRobin(vendors.filter((v) => v.phone || v.email), (v) => v.city, LIMIT);
  say(`Government vendors: ${total} Texas HVAC vendors found (CMBL${arg("sba-file") ? " + SBA export" : ""}${process.env.SAM_API_KEY ? " + SAM.gov" : ""}), using ${vendors.length}${vendors.length < LIMIT ? ` (the official sources hold ${total}; add SAM_API_KEY or an SBA export for more)` : ""}.`);
}

// 3. Permits (all cities), contractor emails filled from the Google and vendor records that are the same company.
let permits = [];
if (!process.argv.includes("--no-permits")) {
  const raw = [];
  for (const [key, src] of Object.entries(SOURCES)) {
    try { const p = await src.fetch({ limit: 1000, days: Number(arg("permit-days", 365)) }); say(`Permits, ${src.label}: ${p.length} HVAC permits.`); raw.push(...p); }
    catch (e) { say(`Permits, ${key}: could not be read (${e.message}).`); }
  }
  const { permits: enriched, filled } = enrichPermitContacts(raw, [{ label: "Google business", records: pool }, { label: "state vendor", records: vendors }]);
  const complete = keepPermits(enriched);
  complete.sort((a, b) => String(b.issued_on ?? "").localeCompare(String(a.issued_on ?? "")));
  permits = complete.slice(0, LIMIT);
  say(`Permits: ${raw.length} read, ${filled} contractor emails filled from matching Google/vendor records, ${complete.length} have a contractor with name, phone and email, using ${permits.length}.`);
}

// 4. Bids (SAM.gov daily file).
let bids = [];
{
  const file = arg("sam-file");
  const source = file ? createReadStream(file) : (await fetch("https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv", { headers: { "User-Agent": "HVACHelpBot/1.0 (business directory research)" } })).body;
  let cols = null;
  const found = new Map();
  for await (const row of csvRows(source)) {
    if (!cols) { cols = columnIndex(row); continue; }
    const st = row[cols.PopState] || row[cols.State];
    if (!bidStates.includes(st)) continue;
    const b = mapBid(row, cols, { state: st });
    if (b?.notice_id) found.set(b.notice_id, b);
  }
  const all = [...found.values()];
  bids = keepBids(all).sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "")).slice(0, LIMIT);
  say(`Bids (${bidStates.join(", ")}): ${all.length} open HVAC notices, ${bids.length} with a contact name, phone and email.`);
}

// 5. Matching.
const links = linkBusinessesToVendors(businesses, vendors);
const stateName = (s) => (s === "TX" ? "Texas" : s);
const vb = [], bb = [], bp = [], vp = [];
for (const b of bids) {
  const opp = { kind: "bid", naics: b.naics, state: stateName(b.state), city: b.city, zip: b.zip, setAsideCode: b.set_aside_code };
  for (const m of matchVendors(vendors, opp, { limit: 10 })) vb.push([b.title, b.agency, b.city, b.state, b.response_due?.slice(0, 10), b.sam_url, m.vendor.name, m.vendor.city, m.vendor.phone, m.vendor.email, m.score, m.reasons]);
  for (const m of matchBusinesses(businesses, opp, { links, limit: 10 })) bb.push([b.title, b.agency, b.city, b.state, b.sam_url, m.business.name, m.business.city, m.business.phone, m.business.email, m.score, m.reasons]);
}
for (const p of permits) {
  const opp = { kind: "permit", state: "Texas", city: p.city, zip: p.zip, contractorName: p.people[0]?.company ?? p.people[0]?.name };
  for (const m of matchBusinesses(businesses, opp, { links, limit: 5 })) bp.push([p.source_id, p.city, p.issued_on, p.summary, p.people[0]?.company, m.business.name, m.business.city, m.business.phone, m.business.email, m.score, m.reasons]);
  for (const m of matchVendors(vendors, opp, { limit: 5 })) vp.push([p.source_id, p.city, p.issued_on, p.summary, m.vendor.name, m.vendor.city, m.vendor.phone, m.vendor.email, m.score, m.reasons]);
}

// 6. Write everything.
const bidCount = new Map(), permCount = new Map();
for (const r of vb) bidCount.set(r[6], (bidCount.get(r[6]) ?? 0) + 1);
for (const r of bb) bidCount.set(r[5], (bidCount.get(r[5]) ?? 0) + 1);
for (const r of bp) permCount.set(r[5], (permCount.get(r[5]) ?? 0) + 1);
const n = {};
n.biz = writeCsv("local_businesses", ["Company", "Address", "City", "State", "ZIP", "Phone", "Email", "Website", "Service category", "Also a state vendor", "Matched bids", "Matched permits", "Google Maps URL"], businesses.map((b) => [b.name, b.address, b.city, b.state, b.postal_code, b.phone, b.email, b.website, b.category, links.has(b) ? "Yes" : "", bidCount.get(b.name) ?? 0, permCount.get(b.name) ?? 0, b.maps_url]));
n.ven = writeCsv("gov_vendors", ["Source", "Vendor ID", "Company", "Address", "City", "State", "ZIP", "Phone", "Email", "Website", "NIGP items", "NAICS", "Classifications", "HVAC fit", "Also a Google business", "Matched bids"], vendors.map((v) => [v.source, v.source_id, v.name, v.address, v.city, v.state, v.postal_code, v.phone, v.email, v.website, v.nigp_items, v.naics, v.classifications, v.hvac_score, [...links.values()].includes(v) ? "Yes" : "", bidCount.get(v.name) ?? 0]));
n.per = writeCsv("permits", ["Permit", "City", "Issued", "Value USD", "Property", "Summary", "Contractor", "Contractor phone", "Contractor email", "Email source", "Matches a business"], permits.map((p) => { const c = p.people[0] ?? {}; return [p.source_id, p.city, p.issued_on, p.value_usd, p.property_class, p.summary, c.company ?? c.name, c.phone, c.email, c.email_source, c.matched_business]; }));
n.bid = writeCsv("bids", ["Notice", "Title", "Agency", "City", "State", "NAICS", "Set-aside", "Response due", "Contact", "Contact email", "Contact phone", "SAM.gov URL"], bids.map((b) => { const c = b.contacts[0] ?? {}; return [b.notice_id, b.title, b.agency, b.city, b.state, b.naics, b.set_aside, b.response_due?.slice(0, 10), c.name, c.email, c.phone, b.sam_url]; }));
n.vb = writeCsv("matches_vendor_bid", ["Bid", "Agency", "Bid city", "State", "Due", "SAM.gov URL", "Vendor", "Vendor city", "Vendor phone", "Vendor email", "Score", "Why"], vb);
n.bb = writeCsv("matches_business_bid", ["Bid", "Agency", "Bid city", "State", "SAM.gov URL", "Business", "Business city", "Phone", "Email", "Score", "Why"], bb);
n.bp = writeCsv("matches_business_permit", ["Permit", "City", "Issued", "Summary", "Permit contractor", "Business", "Business city", "Phone", "Email", "Score", "Why"], bp);
n.vp = writeCsv("matches_vendor_permit", ["Permit", "City", "Issued", "Summary", "Vendor", "Vendor city", "Phone", "Email", "Score", "Why"], vp);
n.link = writeCsv("business_vendor_links", ["Google business", "City", "Phone", "Email", "Same company as state vendor", "Vendor ID", "Vendor NIGP items"], [...links].map(([b, v]) => [b.name, b.city, b.phone, b.email, v.name, v.source_id, v.nigp_items]));

say(`\nMatches: ${n.vb} vendor-to-bid, ${n.bb} business-to-bid, ${n.bp} business-to-permit, ${n.vp} vendor-to-permit; ${n.link} Google businesses are also registered state vendors.`);
const have = (rows, i) => rows.filter((r) => r[i]).length;
say(`Completeness: businesses ${have(businesses.map((b) => [b.phone, b.email]), 0)}/${businesses.length} phone, ${have(businesses.map((b) => [b.phone, b.email]), 1)} email; vendors ${vendors.filter((v) => v.phone).length}/${vendors.length} phone, ${vendors.filter((v) => v.email).length} email; permits ${permits.filter((p) => digits10(p.people[0]?.phone)).length}/${permits.length} contractor phone, ${permits.filter((p) => p.people[0]?.email).length} email; bids ${bids.length}/${bids.length} contact email.`);
writeFileSync(`${out}/summary.txt`, lines.join("\n") + "\n");
