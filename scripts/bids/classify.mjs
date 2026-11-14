// Turns one SAM.gov contract opportunity (a row of the public daily file) into a bid we keep, or drops it.
// SAM.gov is the federal government's site for contracts it wants to buy. A "bid" here is a notice a local HVAC business could answer.

/** The federal NAICS code for plumbing, heating and air-conditioning contractors. */
export const HVAC_NAICS = new Set(["238220"]);
/** Product and service codes for HVAC: maintenance and repair, installation, and heating and cooling equipment. */
export const HVAC_PSC = new Set(["J041", "J042", "N041", "N042", "4120", "4130", "4140", "4510", "4520"]);

const HVAC_WORDS = /\bhvac\b|air[- ]condition|\ba\/c\b|chiller|boiler|furnace|heat pump|cooling tower|air handl|ventilation|refrigerat|heating (and|&) cooling|heating,? ventilat|mini[- ]?split|thermostat|mechanical (system|room|upgrade)/i;

/** Notice types that are still asking for something. Awards, justifications and surplus sales are not leads. */
const OPEN_TYPES = /solicitation|presolicitation|sources sought|special notice|request for information|combined synopsis/i;
const NOT_LEADS = /award|justification|sale of surplus|intent to bundle/i;

const SET_ASIDE_SHORT = {
  SBA: "small business", SBP: "small business", "8A": "8(a)", "8AN": "8(a)", HZC: "HUBZone", HZS: "HUBZone",
  SDVOSBC: "service-disabled veteran-owned", SDVOSBS: "service-disabled veteran-owned", WOSB: "women-owned", WOSBSS: "women-owned",
  EDWOSB: "women-owned", EDWOSBSS: "women-owned", VSA: "veteran-owned", VSS: "veteran-owned",
};

/** The columns of the daily file, by name. */
export function columnIndex(header) {
  const at = (name) => header.indexOf(name);
  const cols = {};
  for (const n of ["NoticeId", "Title", "Sol#", "Department/Ind.Agency", "Sub-Tier", "Office", "PostedDate", "Type", "SetASideCode", "SetASide", "ResponseDeadLine", "NaicsCode", "ClassificationCode", "PopStreetAddress", "PopCity", "PopState", "PopZip", "Active", "PrimaryContactFullname", "PrimaryContactEmail", "PrimaryContactPhone", "PrimaryContactTitle", "SecondaryContactFullname", "SecondaryContactEmail", "SecondaryContactPhone", "State", "City", "ZipCode", "AdditionalInfoLink", "Link", "Description"]) cols[n] = at(n);
  return cols;
}

const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
const orNull = (s) => clean(s) || null;
const titleCase = (s) => clean(s).toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

/** Whether the notice is HVAC work, and why. */
export function hvacReason({ naics, psc, title, description }) {
  if (HVAC_NAICS.has(String(naics))) return "NAICS 238220 (heating and air-conditioning contractors)";
  if (HVAC_PSC.has(String(psc).toUpperCase())) return `Product and service code ${String(psc).toUpperCase()}`;
  if (HVAC_WORDS.test(title)) return "HVAC work in the title";
  if (HVAC_WORDS.test(String(description).slice(0, 1500))) return "HVAC work in the description";
  return null;
}

/** An ISO date (or null) from the file's several date styles. */
export function isoOrNull(text) {
  let iso = String(text ?? "").trim().replace(" ", "T");
  // A date with no time zone is read as UTC, so the answer is the same on every computer.
  if (iso && !/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) iso += "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** One line: the kind of notice, what it is, where, when it is due and who is buying. */
export function summarizeBid({ noticeType, setAsideCode, title, city, state, responseDue, agency }) {
  const aside = SET_ASIDE_SHORT[String(setAsideCode).toUpperCase()];
  const kind = `${clean(noticeType) || "Notice"}${aside ? ` (${aside} set-aside)` : ""}`;
  const what = clean(title).replace(/\.$/, "");
  const where = [city && titleCase(city), state].filter(Boolean).join(", ");
  const due = responseDue ? `, due ${new Date(responseDue).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "";
  return `${kind}: ${what}${where ? ` in ${where}` : ""}${due}${agency ? ` (${titleCase(agency)})` : ""}.`.replace(/\s+/g, " ");
}

/**
 * Reads one row of the daily file. Returns a bid, or null when it is not an open Texas HVAC notice.
 * `now` is the time to compare the deadline with; a notice whose deadline has passed is dropped.
 */
export function mapBid(row, c, { state = "TX", now = Date.now(), maxAgeDays = 365 } = {}) {
  if (row[c.Active] !== "Yes") return null;
  const placeState = row[c.PopState] || row[c.State];
  if (placeState !== state) return null;
  const noticeType = row[c.Type];
  if (NOT_LEADS.test(noticeType) || !OPEN_TYPES.test(noticeType)) return null;

  const responseDue = isoOrNull(row[c.ResponseDeadLine]);
  if (responseDue && Date.parse(responseDue) < now) return null;
  const postedAt = isoOrNull(row[c.PostedDate]);
  if (postedAt && now - Date.parse(postedAt) > maxAgeDays * 86_400_000) return null;

  const title = clean(row[c.Title]);
  const naics = clean(row[c.NaicsCode]);
  const psc = clean(row[c.ClassificationCode]);
  const description = clean(row[c.Description]);
  const reason = hvacReason({ naics, psc, title, description });
  if (!reason) return null;

  const agency = clean(row[c["Sub-Tier"]]) || clean(row[c["Department/Ind.Agency"]]);
  const city = clean(row[c.PopCity]) || clean(row[c.City]);
  const setAsideCode = clean(row[c.SetASideCode]);
  const hasSetAside = setAsideCode !== "" && setAsideCode.toUpperCase() !== "NONE";
  const contact = (n, e, p, t) => ({ name: orNull(row[n]), email: orNull(row[e])?.toLowerCase() ?? null, phone: orNull(row[p]), title: t === undefined ? null : orNull(row[t]) });

  return {
    notice_id: clean(row[c.NoticeId]),
    title: title.slice(0, 300),
    solicitation_number: orNull(row[c["Sol#"]]),
    agency: agency || null,
    department: orNull(row[c["Department/Ind.Agency"]]),
    office: orNull(row[c.Office]),
    notice_type: clean(noticeType),
    posted_at: postedAt,
    response_due: responseDue,
    set_aside: hasSetAside ? orNull(row[c.SetASide]) : null,
    set_aside_code: hasSetAside ? setAsideCode : null,
    naics: naics || null,
    psc: psc || null,
    relevance: reason,
    city: city ? titleCase(city) : null,
    state: placeState,
    zip: orNull(row[c.PopZip]) ?? orNull(row[c.ZipCode]),
    address: orNull(row[c.PopStreetAddress]),
    contacts: [
      contact(c.PrimaryContactFullname, c.PrimaryContactEmail, c.PrimaryContactPhone, c.PrimaryContactTitle),
      contact(c.SecondaryContactFullname, c.SecondaryContactEmail, c.SecondaryContactPhone),
    ].filter((p) => p.name || p.email || p.phone),
    description: description.slice(0, 4000) || null,
    sam_url: orNull(row[c.Link]),
    info_url: orNull(row[c.AdditionalInfoLink]),
    summary: summarizeBid({ noticeType, setAsideCode: hasSetAside ? setAsideCode : "", title, city, state: placeState, responseDue, agency }),
  };
}
