// Offline tests for the permit classifier and the city mappers. Run: npm run permits:test
import assert from "node:assert/strict";
import { buildPermit, classifyProperty, classifyTrade, cleanDescription, dedupe, summarize } from "./classify.mjs";
import { dallasDate, mapAustin, mapDallas } from "./sources.mjs";
import { ageInDays, scorePermit } from "../../src/lib/permit-score.ts";
import { permitTitle } from "../../src/lib/permits.ts";

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
};

test("trade: the permit type decides first", () => {
  assert.equal(classifyTrade({ type: "Mechanical Permit", description: "new house" }), "HVAC");
  assert.equal(classifyTrade({ type: "Residential Mechanical Permit" }), "HVAC");
  assert.equal(classifyTrade({ type: "Commercial Electrical Permit", description: "new construction of a church" }), "Electrical");
  assert.equal(classifyTrade({ type: "Electrical Sign New Construction" }), "Sign");
  assert.equal(classifyTrade({ type: "Plumbing Permit", workClass: "Irrigation" }), "Irrigation");
  assert.equal(classifyTrade({ type: "Residential Plumbing Permit" }), "Plumbing");
  assert.equal(classifyTrade({ type: "Residential Roofing Permit" }), "Roofing");
  assert.equal(classifyTrade({ type: "Residential Solar/PV Permit" }), "Solar");
  assert.equal(classifyTrade({ type: "Residential Pool/Spa Permit" }), "Pool & Spa");
  assert.equal(classifyTrade({ type: "Residential Foundation Repair" }), "Foundation");
  assert.equal(classifyTrade({ type: "Residential Demolition Permit" }), "Demolition");
});

test("trade: a general permit is read from what the work is", () => {
  assert.equal(classifyTrade({ type: "Miscellaneous", description: "REPLACE FURNACE PER CPR DEC 2023 PERMIT REPORT;" }), "HVAC");
  assert.equal(classifyTrade({ type: "New Construction", description: "HVAC CHANGE OUT;" }), "HVAC");
  assert.equal(classifyTrade({ type: "Building Permit", description: "mechanical- replace 2.5 ton heat pump system" }), "HVAC");
  assert.equal(classifyTrade({ type: "Building Permit", description: "re-roof, replace decking" }), "Roofing");
  assert.equal(classifyTrade({ type: "Building Permit", description: "Replace 9 windows like for like" }), "Windows & Doors");
  assert.equal(classifyTrade({ type: "Building Permit", description: "Add EV chargers to the parking lot" }), "Electrical");
  assert.equal(classifyTrade({ type: "Building Permit", workClass: "New", description: "new 2-story single family residence" }), "General construction");
  assert.equal(classifyTrade({ type: "Building Permit", description: "tenant finish out suite 200" }), "General construction");
  assert.equal(classifyTrade({ type: "Misc", description: "inspection" }), "Other");
});

test("residential or commercial", () => {
  assert.equal(classifyProperty({ label: "Residential" }), "residential");
  assert.equal(classifyProperty({ label: "Commercial" }), "commercial");
  assert.equal(classifyProperty({ label: "", type: "Residential Plumbing Permit" }), "residential");
  assert.equal(classifyProperty({ type: "Commercial Mechanical Permit" }), "commercial");
  assert.equal(classifyProperty({ type: "Building (BU) Single Family  Alteration" }), "residential");
  assert.equal(classifyProperty({ type: "Phase - New Construction", landUse: "SINGLE FAMILY DWELLING" }), "residential");
  assert.equal(classifyProperty({ type: "Phase - New Construction" }), "unknown");
  assert.equal(classifyProperty({ label: "Land" }), "unknown");
});

test("summary is one readable line", () => {
  assert.equal(cleanDescription("NSFAA-Fire damage repairs. Full gut."), "Fire damage repairs. Full gut");
  assert.equal(cleanDescription("REPLACE FURNACE PER CPR DEC 2023 PERMIT REPORT;"), "REPLACE FURNACE");
  assert.equal(cleanDescription("ePlan: Residential Expedited Review - Addition at rear"), "Addition at rear");
  assert.ok(cleanDescription("x ".repeat(100)).length <= 82);
  const line = summarize({ propertyClass: "residential", trade: "HVAC", description: "REPLACE FURNACE PER CPR DEC 2023 PERMIT REPORT;", type: "Miscellaneous", valueUsd: 7163, address: "1202 CRESTWICK DR", city: "Murphy" });
  assert.equal(line, "Residential HVAC: replace furnace, $7,163 at 1202 CRESTWICK DR, Murphy.");
  assert.ok(!line.includes("\n"));
  assert.equal(summarize({ propertyClass: "unknown", trade: "Other", description: "", type: "Miscellaneous", valueUsd: null, address: null, city: "Austin" }), "Other: miscellaneous at Austin.");
  assert.match(summarize({ propertyClass: "commercial", trade: "Solar", description: "DISD RESOURCE CENTER Addition", type: "x", valueUsd: 4e6, address: "1 A St", city: "Dallas" }), /^Commercial Solar: DISD RESOURCE CENTER/, "an acronym keeps its capitals");
});

test("a placeholder value is treated as not listed", () => {
  assert.equal(buildPermit({ source: "austin", sourceId: "1", city: "Austin", type: "Building Permit", description: "x", valueUsd: 1, issuedOn: "2026-11-01" }).value_usd, null);
  assert.equal(buildPermit({ source: "austin", sourceId: "1", city: "Austin", type: "Building Permit", description: "x", valueUsd: "128571.43", issuedOn: "2026-11-01" }).value_usd, 128571.43);
});

test("Austin and Dallas rows map to the same shape", () => {
  const a = mapAustin({ permit_number: "2026-143366 MP", permit_type_desc: "Mechanical Permit", permit_class_mapped: "Residential", work_class: "Replacement", description: "replace a/c and furnace", issue_date: "2026-11-04T00:00:00.000", total_job_valuation: "0", mechanical_valuation: "9500", original_address1: "1071 BRICKELL LOOP UNIT A", original_zip: "78744", contractor_company_name: "COOL CO", link: { url: "https://abc.austintexas.gov/x" } });
  assert.deepEqual([a.source, a.source_id, a.city, a.trade, a.property_class, a.value_usd, a.issued_on, a.contractor_name], ["austin", "2026-143366 MP", "Austin", "HVAC", "residential", 9500, "2026-11-04", "COOL CO"]);
  assert.equal(a.source_url, "https://abc.austintexas.gov/x");
  const d = mapDallas({ permit_number: "COM-ME-1", permit_type: "Commercial Mechanical Permit", issued_date: "10/15/26", value: "3000000.00", work_description: "COOL TOWER AND MECH BLDG", street_address: "3000 MOUNTAIN CREEK PKWY, Dallas, TX", zip_code: "75211", contractor: "ACME MECHANICAL" });
  assert.deepEqual([d.source, d.city, d.trade, d.property_class, d.value_usd, d.issued_on, d.address], ["dallas", "Dallas", "HVAC", "commercial", 3000000, "2026-10-15", "3000 MOUNTAIN CREEK PKWY"]);
  assert.equal(dallasDate("12/31/25"), "2025-12-31");
  assert.equal(dallasDate("nonsense"), null);
  for (const p of [a, d]) assert.ok(!JSON.stringify(p).toLowerCase().includes("owner"), "no property owner data");
});

test("repeats of the same work are dropped", () => {
  const one = { source: "dallas", address: "4805 LIVE OAK ST", permit_type: "Commercial Mechanical Permit", issued_on: "2026-10-26", value_usd: 128571, description: "x" };
  assert.equal(dedupe([one, { ...one, source_id: "b" }, { ...one, address: "5 Other St" }]).length, 2);
});

test("score: fresh, valuable, local HVAC replacement is hot; old, small, unserved is cold", () => {
  const now = Date.parse("2026-11-11T00:00:00Z");
  const cover = { cities: new Set(["houston"]), stateCovered: true };
  const hot = scorePermit({ issued_on: "2026-11-09", value_usd: 42000, city: "Houston", description: "replace 5 ton condenser and furnace", permit_type: "Mechanical Permit", property_class: "residential" }, cover, now);
  assert.equal(hot.tier, "hot");
  assert.equal(hot.score, 35 + 22 + (10 + 4) + 20, "fresh 35, high value 22, replacement 10 plus 4 for a 5 ton job, our city 20");
  assert.match(hot.why, /^Fresh, high value, new system or replacement, big job, in a city we serve\.$/);
  const warm = scorePermit({ issued_on: "2026-10-30", value_usd: 8000, city: "Austin", description: "ac repair", permit_type: "Mechanical Permit", property_class: "residential" }, cover, now);
  assert.equal(warm.tier, "warm");
  const cold = scorePermit({ issued_on: "2026-08-01", value_usd: null, city: "Elsewhere", description: "", permit_type: "Mechanical Permit", property_class: "residential" }, { cities: new Set(), stateCovered: false }, now);
  assert.equal(cold.tier, "cold");
  assert.ok(cold.score < 20);
  assert.equal(scorePermit({ issued_on: null, value_usd: 500, city: "X", description: null, permit_type: null, property_class: "unknown" }, cover, now).tier, "cold", "no date");
  assert.equal(scorePermit({ issued_on: "2026-11-11", value_usd: 1e7, city: "Houston", description: "install complete building", permit_type: "x", property_class: "commercial" }, cover, now).score, 100, "never above 100");
  // With no value listed (the usual case) the job and the city decide: a fresh commercial replacement in a city we serve is hot, the same residential one in a city we do not serve is warm.
  const noValue = { issued_on: "2026-11-09", value_usd: null, description: "replace rooftop unit", permit_type: "Mechanical Permit" };
  assert.equal(scorePermit({ ...noValue, city: "Houston", property_class: "commercial" }, cover, now).tier, "hot");
  assert.equal(scorePermit({ ...noValue, city: "Dallas", property_class: "residential" }, cover, now).tier, "warm");
  assert.equal(scorePermit({ ...noValue, issued_on: "2026-10-15", city: "Dallas", property_class: "residential", description: "ac repair" }, cover, now).tier, "cold");
  assert.equal(ageInDays("2026-11-08", now), 3);
  assert.equal(ageInDays("2027-01-01", now), 0, "a future date is not negative");
  assert.equal(ageInDays(null, now), null);
});

test("card title is short and readable", () => {
  assert.equal(permitTitle({ description: "REPLACE FURNACE PER CPR DEC 2023 PERMIT REPORT;", permit_type: "x" }), "Replace furnace");
  assert.equal(permitTitle({ description: "", permit_type: "Mechanical Permit" }), "Mechanical Permit");
  assert.ok(permitTitle({ description: "word ".repeat(40), permit_type: "x" }).length <= 66);
  assert.equal(permitTitle({ description: "Replacement of complete existing central heat and air system", permit_type: "x" }), "Replacement of complete existing central heat and air system");
});

console.log(`${passed} permit tests passed`);
