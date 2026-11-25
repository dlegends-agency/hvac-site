// Public permit data from Socrata open-data portals (the same platform as data.texas.gov). No key is needed; set SOCRATA_APP_TOKEN
// (free) to avoid being throttled. Property owners' names are never read or saved.

import { buildPerson, buildPermit, dedupe } from "./classify.mjs";

const UA = "HVACHelpBot/1.0 (business directory research)";

async function soda(host, id, params) {
  const url = `https://${host}/resource/${id}.json?${new URLSearchParams(params).toString()}`;
  const headers = { "User-Agent": UA, Accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${host} answered ${res.status}`);
  return res.json();
}

const isoDay = (v) => (v ? String(v).slice(0, 10) : null);
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

// ---------------------------------------------------------------- Austin: "Issued Construction Permits" (data.austintexas.gov 3syk-w9eu)
export function mapAustin(r) {
  const big = (v) => (num(v) >= 100 ? num(v) : null);
  const valuation = big(r.total_job_valuation) ?? big(r.mechanical_valuation) ?? big(r.electrical_valuation) ?? big(r.plumbing_valuation) ?? big(r.building_valuation);
  return buildPermit({
    source: "austin",
    sourceId: r.permit_number,
    city: "Austin",
    type: r.permit_type_desc,
    workClass: r.work_class,
    description: r.description,
    contractorTrade: r.contractor_trade,
    label: r.permit_class_mapped || r.permit_class,
    issuedOn: isoDay(r.issue_date),
    valueUsd: valuation,
    address: r.original_address1 || r.permit_location,
    zip: r.original_zip,
    contractor: r.contractor_company_name || r.contractor_full_name,
    url: r.link?.url ?? null,
    // The open data lists the permit's contractor (the street name is cut off at 12 characters by the city) and, sometimes, the applicant.
    // It has no email addresses and no general contractor: those are only on the city's own People Details page.
    people: [
      buildPerson({
        role: r.contractor_trade || "Contractor", company: r.contractor_company_name, name: r.contractor_full_name, phone: r.contractor_phone,
        address: r.contractor_address1 || r.contractor_address2, city: r.contractor_city, state: "TX", zip: r.contractor_zip,
      }),
      buildPerson({
        role: "Applicant", company: r.applicant_org, name: r.applicant_full_name, phone: r.applicant_phone,
        address: r.applicant_address1 || r.applicant_address2, city: r.applicant_city, zip: r.applicantzip,
      }),
    ],
  });
}

/** SQL fragments that pick out heating, cooling and ventilation work in a free-text column. */
const HVAC_WORDS = ["HVAC", "A/C", "AIR COND", "FURNACE", "HEAT PUMP", "CONDENSER", "MINI SPLIT", "MINI-SPLIT", "AIR HANDLER", "DUCT", "THERMOSTAT", "COOLING", "HEATING"];
const likeAny = (column) => HVAC_WORDS.map((w) => `upper(${column}) like '%${w}%'`).join(" OR ");
const isoDaysAgo = (days, now = new Date()) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

/** Only heating, cooling and ventilation permits, issued in the last `days` days, newest first. */
export async function fetchAustin({ limit = 200, days = 30, now = new Date() } = {}) {
  const rows = await soda("data.austintexas.gov", "3syk-w9eu", {
    $where: `issue_date >= '${isoDaysAgo(days, now)}' AND permit_location is not null AND (permit_type_desc = 'Mechanical Permit' OR ${likeAny("description")})`,
    $order: "issue_date DESC, permit_number DESC",
    $limit: String(limit * 2),
  });
  return dedupe(rows.map(mapAustin).filter((p) => p.trade === "HVAC")).slice(0, limit);
}

// ---------------------------------------------------------------- Dallas: "Building Permits" (www.dallasopendata.com e7gq-4sah)
/** Dallas stores the issue date as text like "12/31/25", so it is turned into a real date here. */
export function dallasDate(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function mapDallas(r) {
  const address = String(r.street_address ?? "").replace(/,?\s*Dallas,?\s*TX$/i, "").trim();
  return buildPermit({
    source: "dallas",
    sourceId: r.permit_number,
    city: "Dallas",
    type: r.permit_type,
    description: r.work_description,
    landUse: r.land_use,
    issuedOn: dallasDate(r.issued_date),
    valueUsd: num(r.value),
    address,
    zip: r.zip_code,
    contractor: r.contractor,
    url: null,
    people: [buildPerson({ role: "Contractor", company: r.contractor })],
  });
}

/** Only heating, cooling and ventilation permits, issued in the last `days` days, newest first. */
export async function fetchDallas({ limit = 200, days = 30, now = new Date() } = {}) {
  // The date is text, so the server cannot sort or compare it. Read one month at a time and keep what falls inside the window.
  const cutoff = isoDaysAgo(days, now);
  const found = [];
  for (let back = 0; back <= Math.ceil(days / 28) + 1; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const pattern = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/%/${String(d.getUTCFullYear()).slice(2)}`;
    const rows = await soda("www.dallasopendata.com", "e7gq-4sah", {
      $where: `issued_date like '${pattern}' AND street_address is not null AND (upper(permit_type) like '%MECHANICAL%' OR ${likeAny("work_description")})`,
      $limit: "5000",
    });
    found.push(...rows.map(mapDallas));
  }
  const newest = found
    .filter((p) => p.trade === "HVAC" && p.issued_on && p.issued_on >= cutoff)
    .sort((a, b) => b.issued_on.localeCompare(a.issued_on) || a.source_id.localeCompare(b.source_id));
  return dedupe(newest).slice(0, limit);
}

export const SOURCES = {
  austin: { label: "Austin", fetch: fetchAustin },
  dallas: { label: "Dallas", fetch: fetchDallas },
};

// ---------------------------------------------------------------- Collin County: "Collin CAD Building Permits" (data.texas.gov 82ee-gbj5)
// One dataset for the many cities of Collin County (Plano, Frisco, McKinney, Allen, Prosper, Melissa and more). It has no HVAC permit type, so
// the work description is searched. Property owners' names are never read or saved; the data lists the contractor's or builder's name only.
const titleCity = (s) => String(s ?? "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();

export function mapCollin(r) {
  const city = titleCity(r.situscity || String(r.permitissuedby ?? "").replace(/\s+CITY$/i, ""));
  const contractor = r.permitbuildername || r.permitissuedto;
  return buildPermit({
    source: "collin",
    sourceId: r.permitid,
    city,
    type: r.permittypedescr,
    description: r.permitcomments,
    label: r.proprescom,
    issuedOn: isoDay(r.permitissueddate),
    valueUsd: num(r.permitvalue),
    address: r.situsconcatshort || r.situsconcat,
    zip: r.situszip,
    contractor,
    url: null,
    people: [buildPerson({ role: "Contractor", company: contractor })],
  });
}

/** Only heating, cooling and ventilation permits, issued in the last `days` days, across every city in the county. */
export async function fetchCollin({ limit = 200, days = 30, now = new Date() } = {}) {
  // The county publishes a few weeks late, so always look back at least 90 days (the same permit is never saved twice).
  days = Math.max(days, 90);
  // Some rows carry impossible future dates, so the window also stops today.
  const rows = await soda("data.texas.gov", "82ee-gbj5", {
    $where: `permitissueddate >= '${isoDaysAgo(days, now)}' AND permitissueddate <= '${isoDaysAgo(0, now)}T23:59:59' AND permitcomments is not null AND (${likeAny("permitcomments")})`,
    $order: "permitissueddate DESC, permitnum DESC",
    $limit: String(limit * 8),
  });
  return dedupe(rows.map(mapCollin).filter((p) => p.trade === "HVAC" && p.address)).slice(0, limit * 4);
}

SOURCES.collin = { label: "Collin County (Plano, Frisco, McKinney and more)", fetch: fetchCollin };

// ---------------------------------------------------------------- Fort Worth: "Development Permits" (City of Fort Worth open data, ArcGIS feature service)
// The city's feed lists the property owner, which is never requested here (outFields names only the job columns). It has no contractor, so
// these permits are job leads without contractor contacts.
const FORT_WORTH_URL = "https://services5.arcgis.com/3ddLCBXe1bRt7mzj/arcgis/rest/services/CFW_Open_Data_Development_Permits_View/FeatureServer/0/query";
const FORT_WORTH_FIELDS = "Permit_No,Permit_Type,Permit_SubType,Permit_Category,B1_WORK_DESC,Addr_No,Direction,Street_Name,Street_Suffix,Street_Suffix_Dir,Full_Street_Address,Zip_Code,File_Date,JobValue,Use_Type,Specific_Use";

/** The city fills the street parts (number, direction, name, suffix) even when Full_Street_Address is empty, which it usually is. */
export const fortWorthAddress = (r) => [r.Full_Street_Address, [r.Addr_No, r.Direction, r.Street_Name, r.Street_Suffix, r.Street_Suffix_Dir].filter((x) => x !== null && x !== undefined && String(x).trim() !== "").join(" ")]
  .map((x) => String(x ?? "").trim()).find((x) => x && x !== "Full_Street_Address") ?? null;

export function mapFortWorth(r) {
  const clean = (v) => { const t = String(v ?? "").trim(); return t && t !== "B1_WORK_DESC" ? t : null; }; // newest rows echo the column name when empty
  return buildPermit({
    source: "fortworth",
    sourceId: r.Permit_No,
    city: "Fort Worth",
    type: r.Permit_Type,
    workClass: r.Permit_SubType,
    description: clean(r.B1_WORK_DESC),
    label: r.Use_Type || r.Permit_Category,
    landUse: r.Specific_Use,
    issuedOn: r.File_Date ? new Date(r.File_Date).toISOString().slice(0, 10) : null,
    valueUsd: num(r.JobValue),
    address: fortWorthAddress(r),
    zip: r.Zip_Code,
    contractor: null,
    url: null,
    people: [],
  });
}

/** Only heating, cooling and ventilation permits with an address, filed in the last `days` days, newest first. */
export async function fetchFortWorth({ limit = 200, days = 30, now = new Date() } = {}) {
  const since = isoDaysAgo(days, now);
  const where = `File_Date >= DATE '${since}' AND Street_Name IS NOT NULL AND (UPPER(Permit_Type) LIKE '%MECH%' OR ${likeAny("B1_WORK_DESC")})`;
  const params = new URLSearchParams({ where, outFields: FORT_WORTH_FIELDS, orderByFields: "File_Date DESC", resultRecordCount: String(Math.min(limit * 4, 2000)), f: "json" });
  const res = await fetch(`${FORT_WORTH_URL}?${params}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Fort Worth answered ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`Fort Worth: ${body.error.message}`);
  return dedupe((body.features ?? []).map((f) => mapFortWorth(f.attributes)).filter((p) => p.trade === "HVAC" && p.address)).slice(0, limit * 4);
}

SOURCES.fortworth = { label: "Fort Worth", fetch: fetchFortWorth };
