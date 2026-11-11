// Turns one raw permit into the four things we show: the trade, the project value, residential or commercial, and a one-line summary.
// Plain rules, no AI and no cost, so the same permit always gets the same answer and it can be tested offline.

/** Permit types that already name the trade, checked first. */
const TYPE_TRADES = [
  [/sign\b/i, "Sign"],
  [/mechanical/i, "HVAC"],
  [/electrical|electric\b/i, "Electrical"],
  [/plumbing/i, "Plumbing"],
  [/solar|photovoltaic|\bpv\b/i, "Solar"],
  [/roof/i, "Roofing"],
  [/pool|\bspa\b/i, "Pool & Spa"],
  [/foundation/i, "Foundation"],
  [/demolition|\bdemo\b/i, "Demolition"],
  [/irrigation|sprinkler/i, "Irrigation"],
  [/fence|retaining wall/i, "Fence & Walls"],
];

/** Words in the description or work class, used when the permit type is general (a "building" permit). */
const TEXT_TRADES = [
  ["HVAC", /\bhvac\b|\ba\/c\b|\bac (unit|system|change|replac|install|repair)|air[- ]condition|furnace|heat pump|condenser|duct ?work|\bducts?\b|mini[- ]?split|split system|evaporator|air handler|rooftop unit|\brtu\b|chiller|boiler|thermostat|refrigerat|mechanical/i],
  ["Solar", /solar|photovoltaic|\bpv\b/i],
  ["Roofing", /\broof(ing)?\b|re-?roof|shingle/i],
  ["Pool & Spa", /\bpool\b|\bspa\b/i],
  ["Foundation", /foundation|pier and beam|slab repair/i],
  ["Irrigation", /irrigation|sprinkler|backflow/i],
  ["Plumbing", /plumbing|water heater|sewer|water line|gas line|repipe/i],
  ["Electrical", /electrical|rewire|panel upgrade|service upgrade|generator|ev charg|charging station/i],
  ["Demolition", /demolition|\bdemo\b/i],
  ["Fence & Walls", /\bfence\b|retaining wall/i],
  ["Sign", /\bsigns?\b/i],
  ["Windows & Doors", /\bwindows?\b|\bdoors?\b/i],
];

const GENERAL = /new construction|\bnew\b.{0,25}(stor(y|ies)|single|home|house|building|residence|dwelling|duplex|condo|townhome)|alteration|addition|remodel|renovation|finish[- ]?out|tenant|interior|build[- ]?out|accessory|garage|carport|shell/i;

/** The trade a permit is for: HVAC, Plumbing, Electrical, Roofing, Solar, Pool & Spa, Foundation, Irrigation, Demolition, Fence & Walls, Sign, General construction or Other. */
export function classifyTrade({ type = "", workClass = "", description = "", contractorTrade = "" } = {}) {
  const typeText = String(type);
  const plumbingIrrigation = /plumbing/i.test(typeText) && /irrigation|sprinkler|backflow/i.test(`${workClass} ${description}`);
  if (plumbingIrrigation) return "Irrigation";
  for (const [re, trade] of TYPE_TRADES) if (re.test(typeText)) return trade;
  const text = `${workClass} ${description} ${contractorTrade}`;
  for (const [trade, re] of TEXT_TRADES) if (re.test(text)) return trade;
  if (GENERAL.test(`${typeText} ${workClass} ${description}`)) return "General construction";
  return "Other";
}

/** "residential", "commercial" or "unknown", from the data's own label first, then the permit type. */
export function classifyProperty({ label = "", type = "", landUse = "" } = {}) {
  const pick = (s) => {
    const t = String(s).toLowerCase();
    if (/\bcommercial\b|industrial|office|retail|multi-?family|apartment|warehouse|hotel/.test(t)) return "commercial";
    if (/\bresidential\b|single[- ]family|duplex|townhome|townhouse|\(bu\) single|\(pl\) single|\(me\) single|\(el\) single/.test(t)) return "residential";
    return null;
  };
  return pick(label) ?? pick(type) ?? pick(landUse) ?? "unknown";
}

export const money = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "value not listed" : `$${Math.round(Number(n)).toLocaleString("en-US")}`);

const sentence = (s) => {
  const t = s.trim();
  // ALL CAPS descriptions are common; make them read normally.
  const letters = t.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length > 8 && letters === letters.toUpperCase();
  const base = shouting ? t.toLowerCase() : t;
  // Start in lower case after the "Residential HVAC:" label, but leave an acronym such as "ISD" or "HVAC" alone.
  return /^[A-Z][a-z]/.test(base) ? base.charAt(0).toLowerCase() + base.slice(1) : base;
};

/** The work itself, cleaned: report notes, codes and trailing punctuation removed, clipped to a short phrase. */
export function cleanDescription(description) {
  let d = String(description ?? "")
    .replace(/\s+/g, " ")
    .replace(/\bper\b[^;]*\bpermit report\b[^;]*;?/gi, "")
    .replace(/^(nsfaa|ncaa|nsfnc)\s*-\s*/i, "")
    .replace(/^(e-?plan|express|qteam( qr)?)\s*[:\-]\s*/i, "")
    .replace(/^(e-?plan|express|qteam( qr)?)\s+/i, "")
    .replace(/^residential expedited review\s*-\s*/i, "")
    .replace(/^[A-Z]{2,6}-\s*/, (m) => (/^(HVAC|A\/C)/.test(m) ? m : ""))
    .replace(/[;,.\s]+$/g, "")
    .trim();
  if (d.length > 80) d = `${d.slice(0, 80).replace(/\s+\S*$/, "")}…`;
  return d;
}

/** One line: who it is for, the trade, what the work is, the value and where. */
export function summarize({ propertyClass, trade, description, type, valueUsd, address, city }) {
  const who = propertyClass === "unknown" ? "" : `${propertyClass[0].toUpperCase()}${propertyClass.slice(1)} `;
  const work = cleanDescription(description);
  const what = work ? sentence(work) : String(type || "permit").toLowerCase();
  const where = [address, city].filter(Boolean).join(", ");
  const price = valueUsd === null || valueUsd === undefined ? "" : `, ${money(valueUsd)}`;
  return `${who}${trade}: ${what}${price}${where ? ` at ${where}` : ""}.`.replace(/^([a-z])/, (c) => c.toUpperCase());
}

/** Drops repeats of the same piece of work (one permit is often recorded once per unit or per property). */
export function dedupe(permits) {
  const seen = new Set();
  return permits.filter((p) => {
    const key = [p.source, p.address, p.permit_type, p.issued_on, p.value_usd, p.description].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Turns the pieces a source gives us into the row we save. */
export function buildPermit({ source, sourceId, city, type, workClass, description, contractorTrade, label, landUse, issuedOn, valueUsd, address, zip, contractor, url }) {
  const trade = classifyTrade({ type, workClass, description, contractorTrade });
  const propertyClass = classifyProperty({ label, type, landUse });
  // A value under $100 is a placeholder (some cities record $1 when none was given), so it counts as not listed.
  const asNumber = valueUsd === null || valueUsd === undefined || valueUsd === "" ? null : Number(valueUsd);
  const value = asNumber !== null && asNumber >= 100 ? asNumber : null;
  return {
    source,
    source_id: String(sourceId),
    city,
    permit_type: type ?? null,
    issued_on: issuedOn,
    trade,
    value_usd: Number.isFinite(value) ? value : null,
    property_class: propertyClass,
    summary: summarize({ propertyClass, trade, description, type, valueUsd: Number.isFinite(value) ? value : null, address, city }),
    description: description ? String(description).replace(/\s+/g, " ").trim().slice(0, 1000) : null,
    address: address ?? null,
    zip: zip ? String(zip).slice(0, 10) : null,
    contractor_name: contractor ? String(contractor).slice(0, 200) : null,
    source_url: url ?? null,
  };
}
