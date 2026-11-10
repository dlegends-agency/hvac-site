// Offline tests for the permit classifier and the city mappers. Run: npm run permits:test
import assert from "node:assert/strict";
import { buildPermit, classifyProperty, classifyTrade, cleanDescription, dedupe, summarize } from "./classify.mjs";
import { dallasDate, mapAustin, mapDallas } from "./sources.mjs";

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
  assert.equal(summarize({ propertyClass: "unknown", trade: "Other", description: "", type: "Miscellaneous", valueUsd: null, address: null, city: "Austin" }), "Other: miscellaneous, value not listed at Austin.");
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

console.log(`${passed} permit tests passed`);
