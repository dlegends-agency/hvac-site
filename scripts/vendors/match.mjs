// Matches vendors to a government bid or building permit. Pure, so it is tested offline.
import { DEFAULT_MAP, looksHvac, targetsFor } from "./nigp.mjs";

export const MATCH_THRESHOLD = 60;

/** SAM.gov set-aside codes -> the vendor classification that qualifies. */
const SET_ASIDE_CLASS = [
  [/^(SBA|SBP)$/i, "Small business"], [/^8A/i, "8(a)"], [/^(HZC|HZS)$/i, "HUBZone"], [/^SDVOSB/i, "Service-disabled veteran"],
  [/^(WOSB|EDWOSB)/i, "Woman-owned"], [/^(VSA|VSS)$/i, "Veteran-owned"],
];

const city = (s) => String(s ?? "").trim().toLowerCase();

/**
 * opp = { kind: "bid" | "permit", naics?, state, city?, zip?, setAsideCode? }. Permits are HVAC permits, so they use NAICS 238220.
 * Returns { score, reasons } or null when the vendor does not fit (wrong state, or its codes are too weak).
 */
export function scoreVendor(vendor, opp, map = DEFAULT_MAP) {
  const reasons = [];
  const targets = targetsFor(opp.naics || "238220", map);
  const items = new Set(vendor.nigp_items ?? []);
  const classes = new Set(vendor.nigp_classes ?? []);
  let code = 0;
  let codeWhy = null;
  for (const m of targets) {
    const hitItem = m.nigp_item && items.has(`${m.nigp_class}-${m.nigp_item}`);
    const hitClass = !m.nigp_item && classes.has(m.nigp_class);
    if ((hitItem || hitClass) && m.weight > code) {
      code = m.weight;
      codeWhy = `NIGP ${m.nigp_class}${m.nigp_item ? `-${m.nigp_item}` : ""}${m.note ? ` (${m.note})` : ""}`;
    }
  }
  if ((vendor.naics ?? []).some((n) => targets.some((t) => t.naics === n) || n === String(opp.naics))) {
    if (code < 100) {
      code = 100;
      codeWhy = `NAICS ${opp.naics || "238220"} registered`;
    }
  }
  if (looksHvac(vendor.name) && code < 60) {
    code = 60;
    codeWhy = "HVAC in the business name";
  }
  if (code === 0) return null;
  if (codeWhy) reasons.push(codeWhy);

  if (!opp.state || !vendor.state || city(opp.state) !== city(vendor.state)) return null; // a vendor must be in the work's state
  let loc = 5;
  if (opp.city && vendor.city && city(opp.city) === city(vendor.city)) {
    loc = 20;
    reasons.push(`Based in ${vendor.city}`);
  } else if (opp.zip && vendor.postal_code && String(opp.zip).slice(0, 3) === String(vendor.postal_code).slice(0, 3)) {
    loc = 12;
    reasons.push("Nearby ZIP area");
  } else reasons.push(`In ${vendor.state}`);

  let qual = 0;
  const wanted = SET_ASIDE_CLASS.find(([re]) => re.test(String(opp.setAsideCode ?? "")))?.[1];
  if (wanted && (vendor.classifications ?? []).includes(wanted)) {
    qual = 10;
    reasons.push(`Qualifies for the ${wanted} set-aside`);
  } else if (wanted) {
    qual = -15; // a set-aside the vendor does not qualify for
    reasons.push(`Set-aside needs ${wanted}`);
  }

  const score = Math.max(0, Math.min(100, Math.round(code * 0.7 + loc + qual)));
  return { score, reasons };
}

/** The best vendors for one opportunity (score at or above the threshold), best first. */
export function matchVendors(vendors, opp, { map = DEFAULT_MAP, threshold = MATCH_THRESHOLD, limit = 25 } = {}) {
  const out = [];
  for (const v of vendors) {
    const m = scoreVendor(v, opp, map);
    if (m && m.score >= threshold) out.push({ vendor: v, ...m });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
