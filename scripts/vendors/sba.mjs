// Certified small businesses (8(a), HUBZone, women-owned, service-disabled veteran-owned ...).
// The SBA Small Business Search site (search.certifications.sba.gov) has no public API or bulk download and its pages are for people,
// so this app does NOT scrape it. Two permitted routes are supported instead:
//   1. importCsv(): a CSV that an admin exported from that site (or any other permitted export) and saved locally.
//   2. fetchSam(): the official SAM.gov Entity Management API (free key from sam.gov, env SAM_API_KEY), which carries the same SBA
//      certifications plus NAICS codes. Public (non-sensitive) data only; no email is returned there.
import { csvRows } from "../bids/csv.mjs";
import { cleanEmail } from "../discovery-agent/email.mjs";
import { cleanUrl, formatPhone, stateName } from "../discovery-agent/util.mjs";
import { hvacScore, MIN_VENDOR_SCORE } from "./nigp.mjs";
import { createHash } from "node:crypto";

const ALIASES = {
  name: ["firm name", "business name", "company name", "legal business name", "company", "name"],
  uei: ["uei", "uei (sam)", "uei sam"],
  address: ["address", "address line 1", "street", "street address", "physical address"],
  city: ["city"],
  state: ["state", "st"],
  zip: ["zip", "zip code", "postal code"],
  phone: ["phone", "phone number", "telephone"],
  email: ["email", "email address", "e-mail"],
  website: ["website", "web site", "url", "web address"],
  naics: ["naics", "naics code", "naics codes", "naics code(s)"],
  certs: ["certifications", "certification", "certs", "sba certifications"],
  contact: ["contact", "contact name", "point of contact"],
  description: ["capabilities", "capability narrative", "description"],
};

const CERT_LABEL = [
  [/8\(?a\)?/i, "8(a)"], [/hubzone|\bhz\b/i, "HUBZone"], [/edwosb/i, "Economically disadvantaged woman-owned"], [/wosb|woman|women/i, "Woman-owned"],
  [/sdvosb|service.?disabled/i, "Service-disabled veteran"], [/vosb|veteran/i, "Veteran-owned"], [/small ?disadvantaged|sdb/i, "Small disadvantaged business"],
];
export const certLabels = (text) => [...new Set(CERT_LABEL.filter(([re]) => re.test(text)).map(([, l]) => l))];

function pick(row, header, names) {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i > -1 && row[i]?.trim()) return row[i].trim();
  }
  return null;
}

/** One row of an SBA-style export -> a vendor, or null. */
export function mapSbaRow(row, header, map, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const g = (k) => pick(row, header, ALIASES[k]);
  const name = g("name");
  if (!name) return null;
  const certsText = g("certs") ?? "";
  const naics = (g("naics") ?? "").match(/\b\d{6}\b/g) ?? [];
  const zip = g("zip")?.match(/\d{5}/)?.[0] ?? null;
  const uei = g("uei");
  const vendor = {
    source: "sba",
    source_id: uei ?? createHash("sha1").update(`${name}|${zip ?? ""}`.toLowerCase()).digest("hex").slice(0, 16),
    name,
    address: g("address"),
    city: g("city"),
    state: stateName(g("state")),
    postal_code: zip,
    county: null,
    phone: formatPhone(g("phone")),
    email: cleanEmail(g("email")),
    website: cleanUrl(g("website")),
    contact_name: g("contact"),
    description: g("description")?.slice(0, 1000) ?? null,
    naics: [...new Set(naics)],
    nigp_classes: [],
    nigp_items: [],
    classifications: certLabels(certsText),
    certifications: certLabels(certsText).map((type) => ({ type })),
    registration: { uei: uei ?? null },
    source_updated_on: today,
  };
  vendor.hvac_score = hvacScore(vendor, map);
  return vendor.hvac_score >= MIN_VENDOR_SCORE ? vendor : null;
}

export async function importCsv(text, map, { state = "Texas" } = {}) {
  let header = null;
  const vendors = [];
  let total = 0;
  for await (const r of csvRows([text])) {
    if (!header) {
      header = r.map((h) => h.trim().toLowerCase());
      continue;
    }
    total++;
    const v = mapSbaRow(r, header, map);
    if (v && (!state || v.state === state)) vendors.push(v);
  }
  return { vendors, total };
}

/** SAM.gov Entity Management API record -> vendor. Field names follow SAM.gov's v3 entity response; missing parts are tolerated. */
export function mapSamEntity(e, map, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const reg = e.entityRegistration ?? {};
  const core = e.coreData ?? {};
  const addr = core.physicalAddress ?? {};
  const types = core.businessTypes ?? {};
  const sba = (types.sbaBusinessTypeList ?? []).filter((s) => !s.certificationExitDate || new Date(s.certificationExitDate) > new Date());
  const naics = (e.assertions?.goodsAndServices?.naicsList ?? []).map((n) => String(n.naicsCode));
  if (!reg.legalBusinessName || !reg.ueiSAM) return null;
  const labels = [...new Set([...sba.map((s) => s.sbaBusinessTypeDesc ?? ""), ...(types.businessTypeList ?? []).map((b) => b.businessTypeDesc ?? "")].flatMap((t) => certLabels(t)))];
  const vendor = {
    source: "sam",
    source_id: reg.ueiSAM,
    name: reg.legalBusinessName,
    address: [addr.addressLine1, addr.addressLine2].filter(Boolean).join(", ") || null,
    city: addr.city ?? null,
    state: stateName(addr.stateOrProvinceCode),
    postal_code: String(addr.zipCode ?? "").match(/\d{5}/)?.[0] ?? null,
    county: null,
    phone: null,
    email: null,
    website: cleanUrl(core.entityInformation?.entityURL),
    contact_name: null,
    description: null,
    naics: [...new Set(naics)],
    nigp_classes: [],
    nigp_items: [],
    classifications: labels,
    certifications: sba.map((s) => ({ type: s.sbaBusinessTypeDesc, from: s.certificationEntryDate ?? null, to: s.certificationExitDate ?? null })),
    registration: { uei: reg.ueiSAM, cage: reg.cageCode ?? null, status: reg.registrationStatus ?? null, expires: reg.registrationExpirationDate ?? null },
    source_updated_on: (reg.lastUpdateDate ?? today).slice(0, 10),
  };
  vendor.hvac_score = hvacScore(vendor, map);
  return vendor.hvac_score >= MIN_VENDOR_SCORE ? vendor : null;
}

/** Official SAM.gov API: active Texas registrations listing the HVAC NAICS code. Respects the API's paging; stops at maxPages. */
export async function fetchSam(map, { apiKey, state = "TX", naics = "238220", maxPages = 20, fetchFn = fetch, log = () => {} } = {}) {
  if (!apiKey) return { vendors: [], total: 0, skipped: "no SAM_API_KEY" };
  const vendors = [];
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = `https://api.sam.gov/entity-information/v3/entities?api_key=${encodeURIComponent(apiKey)}&registrationStatus=A&physicalAddressStateOrProvinceCode=${state}&naicsCode=${naics}&includeSections=entityRegistration,coreData,assertions&page=${page}&size=10`;
    const res = await fetchFn(url, { headers: { "User-Agent": "HVACHelpBot/1.0 (business directory research)" }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 429) {
      log("SAM.gov rate limit reached; stopping here and continuing on the next sync.");
      break;
    }
    if (!res.ok) throw new Error(`SAM.gov answered ${res.status}`);
    const body = await res.json();
    const list = body.entityData ?? [];
    total += list.length;
    for (const e of list) {
      const v = mapSamEntity(e, map);
      if (v) vendors.push(v);
    }
    if (list.length < 10) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { vendors, total };
}
