// Texas Comptroller Centralized Master Bidders List (CMBL), from the Comptroller's OFFICIAL downloadable files (refreshed nightly):
//   https://www.comptroller.texas.gov/purchasing/downloads/   "Active CMBL/VetHUB Vendors Master File" and "Class Data and VIDs"
// These are published for exactly this use, so the search form (which is for people, and exports at most 1,000 vendors) is not scraped.
// web_name.csv = one row per vendor (name, address, phone, email, HUB flags). vnr_clas.csv = the NIGP class/item codes each vendor lists.

import { csvRows } from "../bids/csv.mjs";
import { cleanEmail } from "../discovery-agent/email.mjs";
import { formatPhone, stateName } from "../discovery-agent/util.mjs";
import { hvacScore, MIN_VENDOR_SCORE } from "./nigp.mjs";

export const CMBL_FILES = {
  vendors: "https://www.comptroller.texas.gov/auto-data/purchasing/web_name.csv",
  classes: "https://www.comptroller.texas.gov/auto-data/purchasing/vnr_clas.csv",
};
const UA = "HVACHelpBot/1.0 (business directory research)";

async function rowsOf(text) {
  const out = [];
  let header = null;
  for await (const r of csvRows([text])) {
    if (!header) {
      header = r.map((h) => h.trim().toUpperCase());
      continue;
    }
    if (r.length < 2) continue;
    out.push(Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  }
  return out;
}

/** CMBL files are Windows-1252 text. */
export async function download(url, fetchFn = fetch) {
  const res = await fetchFn(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return new TextDecoder("windows-1252").decode(await res.arrayBuffer());
}

const titleCase = (s) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s/(&-])([a-z])/g, (m, a, b) => a + b.toUpperCase()));
const fiveDigitZip = (z) => String(z ?? "").match(/\d{5}/)?.[0] ?? null;

/** vnr_clas.csv -> Map(vendor id -> { classes: Set("910"), items: Set("910-36") }). Item N is the Nth character of ITEM_FLAGS, so the flags are read untrimmed. */
export async function parseClassesRaw(text) {
  const byVid = new Map();
  let header = null;
  for await (const r of csvRows([text])) {
    if (!header) {
      header = r.map((h) => h.trim().toUpperCase());
      continue;
    }
    const get = (n) => r[header.indexOf(n)] ?? "";
    const vid = get("CLASS_VID").trim();
    const cls = get("CLASS_CODE").trim().padStart(3, "0");
    if (!vid || !/^\d{3}$/.test(cls)) continue;
    const v = byVid.get(vid) ?? { classes: new Set(), items: new Set() };
    v.classes.add(cls);
    const flags = get("ITEM_FLAGS");
    for (let i = 0; i < flags.length; i++) if (flags[i] !== " ") v.items.add(`${cls}-${String(i + 1).padStart(2, "0")}`);
    byVid.set(vid, v);
  }
  return byVid;
}

/** One vendor row + its codes -> the shape saved in gov_vendors, or null when it is not an HVAC-relevant Texas vendor. */
export function mapCmblVendor(r, codes, map, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const name = r.WEB_NAME_VENDOR_NAME;
  if (!r.WEB_VID || !name) return null;
  const classifications = [];
  if (r.WEB_HUB_STATUS === "A") classifications.push("HUB (Historically Underutilized Business)");
  if (r.WEB_SDV_FLAG === "Y") classifications.push("Service-disabled veteran");
  if (r.WEB_SMALL_BUS_FLAG === "Y") classifications.push("Small business");
  const street = [r.WEB_ADDR1, r.WEB_ADDR2].filter(Boolean).join(", ") || null;
  const vendor = {
    source: "cmbl",
    source_id: r.WEB_VID,
    name: titleCase(name),
    address: street ? titleCase(street) : null,
    city: r.WEB_CITY ? titleCase(r.WEB_CITY) : null,
    state: stateName(r.WEB_STATE),
    postal_code: fiveDigitZip(r.WEB_ZIP),
    county: r.WEB_COUNTY ? titleCase(r.WEB_COUNTY) : null,
    phone: formatPhone(r.WEB_PHONE),
    email: cleanEmail(r.WEB_EMAIL_ADDRESS),
    website: null,
    contact_name: r.WEB_CONTACT || null,
    description: r.WEB_DESC || null,
    naics: [],
    nigp_classes: [...(codes?.classes ?? [])].sort(),
    nigp_items: [...(codes?.items ?? [])].sort(),
    classifications,
    certifications: r.WEB_HUB_STATUS === "A" ? [{ type: "Texas HUB", to: r.WEB_HUB_EXPIRE_DATE || null }] : [],
    registration: { cmbl_vendor_no: r.WEB_VENDOR_NO || null, texas_office: r.WEB_TX_OFFICE_FLAG === "Y", hub_expires: r.WEB_HUB_EXPIRE_DATE || null },
    source_updated_on: today,
  };
  vendor.hvac_score = hvacScore(vendor, map);
  return vendor.hvac_score >= MIN_VENDOR_SCORE ? vendor : null;
}

/** Downloads (or reads the given texts) and returns { vendors, total } where vendors are the HVAC-relevant Texas ones. */
export async function loadCmbl(map, { state = "Texas", vendorsText, classesText, fetchFn = fetch, log = () => {} } = {}) {
  const vText = vendorsText ?? (await download(CMBL_FILES.vendors, fetchFn));
  const cText = classesText ?? (await download(CMBL_FILES.classes, fetchFn));
  const rows = await rowsOf(vText);
  const codes = await parseClassesRaw(cText);
  log(`CMBL: ${rows.length} active vendors, codes for ${codes.size}.`);
  const vendors = [];
  for (const r of rows) {
    if (r.WEB_CMBL_REASON_OFF) continue; // not an active CMBL vendor
    const v = mapCmblVendor(r, codes.get(r.WEB_VID), map);
    if (v && (!state || v.state === state)) vendors.push(v);
  }
  return { vendors, total: rows.length };
}
