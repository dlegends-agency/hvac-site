// Public permit data from Socrata open-data portals (the same platform as data.texas.gov). No key is needed; set SOCRATA_APP_TOKEN
// (free) to avoid being throttled. Property owners' names are never read or saved.

import { buildPermit, dedupe } from "./classify.mjs";

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
  });
}

export async function fetchAustin(count) {
  const rows = await soda("data.austintexas.gov", "3syk-w9eu", {
    $where: "issue_date is not null AND total_job_valuation >= 100 AND permit_location is not null",
    $order: "issue_date DESC, permit_number DESC",
    $limit: String(count * 3),
  });
  return dedupe(rows.map(mapAustin)).slice(0, count);
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
  });
}

export async function fetchDallas(count, now = new Date()) {
  // The date is text, so it cannot be sorted by the server. Read one month at a time, newest first, until there are enough.
  const found = [];
  for (let back = 0; back < 8 && found.length < count; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const pattern = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/%/${String(d.getUTCFullYear()).slice(2)}`;
    const rows = await soda("www.dallasopendata.com", "e7gq-4sah", {
      $where: `issued_date like '${pattern}' AND value >= 100 AND street_address is not null`,
      $limit: "1000",
    });
    found.push(...rows.map(mapDallas));
  }
  const newest = found.filter((p) => p.issued_on).sort((a, b) => b.issued_on.localeCompare(a.issued_on) || a.source_id.localeCompare(b.source_id));
  return dedupe(newest).slice(0, count);
}

export const SOURCES = {
  austin: { label: "Austin", fetch: fetchAustin },
  dallas: { label: "Dallas", fetch: fetchDallas },
};
