// NAICS -> NIGP mapping. NAICS is the federal industry code on bids and SAM.gov registrations; NIGP is the commodity code Texas
// vendors list themselves under in the Comptroller's CMBL (class = 3 digits, item = 2 digits, written 910-36).
// The same rows are seeded in supabase/schema-vendors.sql (table naics_nigp_map); admins can edit that table and the sync reads it first.

export const DEFAULT_MAP = [
  { naics: "238220", nigp_class: "910", nigp_item: "36", weight: 100, note: "Heating, air conditioning and ventilation maintenance, repair and installation services" },
  { naics: "238220", nigp_class: "910", nigp_item: "04", weight: 60, note: "Air duct cleaning services" },
  { naics: "238220", nigp_class: "910", nigp_item: "17", weight: 60, note: "HVAC / energy computerized control systems" },
  { naics: "238220", nigp_class: "936", nigp_item: "67", weight: 70, note: "Refrigeration equipment maintenance and repair" },
  { naics: "238220", nigp_class: "910", nigp_item: "60", weight: 25, note: "Plumbing maintenance and repair (weak signal)" },
  { naics: "238220", nigp_class: "031", nigp_item: "03", weight: 35, note: "Commercial and industrial air conditioner systems" },
  { naics: "238220", nigp_class: "031", nigp_item: "06", weight: 35, note: "Central air conditioning and heating systems" },
  { naics: "238220", nigp_class: "031", nigp_item: "51", weight: 30, note: "Central heating furnaces" },
  { naics: "238220", nigp_class: "912", nigp_item: null, weight: 15, note: "General construction services (weak signal)" },
  { naics: "238220", nigp_class: "914", nigp_item: null, weight: 15, note: "Trades construction services (weak signal)" },
  { naics: "333415", nigp_class: "031", nigp_item: null, weight: 40, note: "Air conditioning and warm air heating equipment" },
  { naics: "811310", nigp_class: "936", nigp_item: "67", weight: 50, note: "Commercial equipment repair: refrigeration" },
];

/** A vendor needs at least this score to be stored (equipment-only 031 vendors score 30-40): it keeps equipment suppliers (031 only) and general builders (912/914 only) out. */
export const MIN_VENDOR_SCORE = 50;

/** The service names shown on a listing, by NIGP item. */
export const SERVICE_LABELS = {
  "910-36": "Heating, air conditioning and ventilation service",
  "910-04": "Air duct cleaning",
  "910-17": "HVAC control systems",
  "936-67": "Refrigeration repair",
  "031-03": "Commercial air conditioning systems",
  "031-06": "Central air conditioning and heating",
  "031-51": "Furnaces",
};

const HVAC_NAME = /\b(hvac|air ?condition\w*|a\/c|heating|cooling|refrigerat\w*|mechanical|furnace|boiler|chiller|climate|comfort)\b/i;
export const looksHvac = (text) => HVAC_NAME.test(String(text ?? ""));

/** Map rows that apply to this NAICS code (exact match, or the map row is a 4-digit group the code falls under). */
export function targetsFor(naics, map = DEFAULT_MAP) {
  const n = String(naics ?? "").trim();
  if (!n) return [];
  return map.filter((m) => n === m.naics || (m.naics.length < 6 && n.startsWith(m.naics)));
}

/** How strongly a vendor's codes (and wording) say "does HVAC work", 0-100. Pure. */
export function hvacScore(vendor, map = DEFAULT_MAP) {
  const items = new Set(vendor.nigp_items ?? []);
  const classes = new Set(vendor.nigp_classes ?? []);
  const naics = new Set(vendor.naics ?? []);
  let best = 0;
  for (const m of map) {
    const hit = m.nigp_item ? items.has(`${m.nigp_class}-${m.nigp_item}`) : classes.has(m.nigp_class);
    if (hit) best = Math.max(best, m.weight);
    if (naics.has(m.naics)) best = Math.max(best, m.weight);
  }
  if (looksHvac(vendor.name)) best = Math.max(best, 60);
  else if (looksHvac(vendor.description) && best > 0) best = Math.min(100, best + 10);
  return best;
}

/** Listing service names from a vendor's codes. */
export function servicesFor(vendor) {
  const out = new Set();
  for (const code of vendor.nigp_items ?? []) if (SERVICE_LABELS[code]) out.add(SERVICE_LABELS[code]);
  if ((vendor.naics ?? []).includes("238220")) out.add("Heating, air conditioning and ventilation service");
  if (!out.size && looksHvac(`${vendor.name} ${vendor.description ?? ""}`)) out.add("Heating, air conditioning and ventilation service");
  return [...out];
}
