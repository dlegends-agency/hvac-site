// Offline tests for the permit classifier and the city mappers. Run: npm run permits:test
import assert from "node:assert/strict";
import { buildPermit, buildPerson, phoneText, classifyProperty, classifyTrade, cleanDescription, dedupe, summarize } from "./classify.mjs";
import { dallasDate, mapAustin, mapDallas } from "./sources.mjs";
import { ageInDays, scorePermit } from "../../src/lib/permit-score.ts";
import { matchDirectory, permitTitle } from "../../src/lib/permits.ts";
import { contactKey, domainGuesses, enrichPermits, findContractorEmail, pageHasPhone, plainCompany } from "./contacts.mjs";

let passed = 0;
const pending = [];
const fail = (name, e) => {
  console.error(`FAIL ${name}\n`, e);
  process.exitCode = 1;
};
const test = (name, fn) => {
  try {
    const result = fn();
    if (result && typeof result.then === "function") pending.push(result.then(() => void passed++, (e) => fail(name, e)));
    else passed++;
  } catch (e) {
    fail(name, e);
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

test("people on a permit: contractor details from the open data", () => {
  assert.equal(phoneText("5129943000"), "(512) 994-3000");
  assert.equal(phoneText("15129943000"), "(512) 994-3000");
  assert.equal(phoneText("994-3000"), null);
  assert.equal(buildPerson({ role: "Mechanical Contractor" }), null, "no company and no name is not a person");
  const a = mapAustin({ permit_number: "2026-145369 MP", permit_type_desc: "Mechanical Permit", issue_date: "2026-11-09T00:00:00.000", mechanical_valuation: "1000000", original_address1: "13401 ESCARPMENT BLVD", link: { url: "https://abc.austintexas.gov/x" },
    contractor_trade: "Mechanical Contractor", contractor_company_name: "Team Services", contractor_full_name: "Glen Smith", contractor_phone: "5129943000", contractor_address2: "2201  PATTER", contractor_city: "PFLUGERVILLE", contractor_zip: "78660-____" });
  assert.equal(a.people.length, 1);
  assert.deepEqual(a.people[0], { role: "Mechanical Contractor", company: "Team Services", name: "Glen Smith", phone: "(512) 994-3000", email: null, website: null, address: "2201 PATTER", city: "PFLUGERVILLE", state: "TX", zip: "78660" });
  const withApplicant = mapAustin({ permit_number: "2", permit_type_desc: "Mechanical Permit", issue_date: "2026-11-09T00:00:00.000", contractor_company_name: "Cool Co", applicant_full_name: "Pat Lee", applicant_org: "Navcon Group", applicant_phone: "5125312800", applicant_address1: "4801 University Blvd" });
  assert.deepEqual(withApplicant.people.map((p) => [p.role, p.company, p.phone]), [["Contractor", "Cool Co", null], ["Applicant", "Navcon Group", "(512) 531-2800"]]);
  const d = mapDallas({ permit_number: "COM-ME-1", permit_type: "Commercial Mechanical Permit", issued_date: "10/15/26", street_address: "1 A St, Dallas, TX", contractor: "ACME MECHANICAL" });
  assert.deepEqual(d.people.map((p) => [p.role, p.company]), [["Contractor", "ACME MECHANICAL"]]);
  assert.deepEqual(mapAustin({ permit_number: "3", permit_type_desc: "Mechanical Permit", issue_date: "2026-11-09T00:00:00.000" }).people, [], "none when the city lists none");
});

test("a contractor is matched to the directory by phone or by name", () => {
  const dir = [
    { id: "1", business_name: "Team Services, LLC", slug: "team", phone: "(512) 994-3000", email: "info@teamservicestx.com", website: null, city: "Pflugerville" },
    { id: "2", business_name: "McCullough Heating & Air", slug: "mc", phone: null, email: "hi@mccullough.com", website: "https://mccullough.com", city: "Austin" },
  ];
  assert.equal(matchDirectory({ company: "Someone Else", name: null, phone: "(512) 994-3000" }, dir)?.id, "1", "same phone number");
  assert.equal(matchDirectory({ company: "McCullough Heating & Air Inc.", name: null, phone: null }, dir)?.id, "2", "same name, ignoring Inc and punctuation");
  assert.equal(matchDirectory({ company: "Unknown HVAC", name: "Bob", phone: "(555) 123-4567" }, dir), null);
  assert.equal(matchDirectory({ company: "Co", name: null, phone: null }, dir), null, "a name that short is not matched");
});

test("the score has four parts that add up", () => {
  const cover = { cities: new Set(["austin"]), stateCovered: true };
  const r = scorePermit({ issued_on: "2026-11-09", value_usd: 30000, city: "Austin", description: "replace condenser", permit_type: "Mechanical Permit", property_class: "residential" }, cover, Date.parse("2026-11-11T00:00:00Z"));
  assert.deepEqual(r.parts.map((x) => x.label), ["Freshness", "Project value", "Kind and size of job", "Service area"]);
  assert.equal(r.parts.reduce((s, x) => s + x.points, 0), r.score);
  assert.ok(r.parts.every((x) => x.points <= x.max));
});

test("contractor email: keys and likely website addresses", () => {
  assert.equal(plainCompany("Team Services, LLC"), "team services");
  assert.equal(plainCompany("McCullough Heating & Air"), "mccullough heating and air");
  assert.equal(contactKey({ company: "Team Services", phone: "(512) 994-3000" }), "phone:5129943000", "the phone number is the key when there is one");
  assert.equal(contactKey({ company: "Team Services LLC", name: null, phone: null }), "name:team services");
  assert.equal(contactKey({ company: "Co", phone: null }), "", "a name that short is not a key");
  assert.deepEqual(domainGuesses("Team Services", "Pflugerville", 3), ["https://www.teamservices.com", "https://www.team-services.com", "https://www.teamservicestx.com"]);
  assert.ok(domainGuesses("McCullough Heating & Air").includes("https://www.mcculloughheatingandair.com"));
  assert.deepEqual(domainGuesses("AC"), [], "too short to guess");
  assert.ok(pageHasPhone("Call us: 512.994.3000 today", "(512) 994-3000"));
  assert.ok(!pageHasPhone("Call us: 512-111-2222", "(512) 994-3000"));
  assert.ok(!pageHasPhone("anything", null));
});

test("contractor email: where it comes from", async () => {
  const person = { role: "Mechanical Contractor", company: "Team Services", name: "Glen Smith", phone: "(512) 994-3000" };
  const never = async () => assert.fail("must not visit a site");
  // 1. the directory already has it
  const known = new Map([["phone:5129943000", { email: "info@teamservicestx.com", website: "https://teamservicestx.com" }]]);
  assert.deepEqual(await findContractorEmail(person, { known, readSiteFn: never }), { email: "info@teamservicestx.com", website: "https://teamservicestx.com", source: "directory", found: true });
  // 2. a guessed website counts only when it shows the contractor's own phone number
  const pages = {
    "https://www.teamservices.com": { ok: true, text: "Team Services Inc, call 800-555-0000", email: "wrong@teamservices.com", pages: ["https://www.teamservices.com/"] },
    "https://www.team-services.com": { ok: false, reason: "HTTP 403" },
    "https://www.teamservicestx.com": { ok: true, text: "Team Services Texas (512) 994-3000", email: "info@teamservicestx.com", pages: ["https://www.teamservicestx.com/"] },
  };
  const visited = [];
  const read = async (u) => (visited.push(u), pages[u] ?? { ok: false, reason: "fetch failed" });
  const r = await findContractorEmail(person, { readSiteFn: read, city: "Pflugerville" });
  assert.deepEqual([r.email, r.found, r.source], ["info@teamservicestx.com", true, "website"]);
  assert.ok(visited.includes("https://www.teamservices.com"), "the wrong business was looked at");
  assert.notEqual(r.email, "wrong@teamservices.com", "but its email was not taken, because its phone number did not match");
  // 3. a search result is tried before the guesses
  const searched = await findContractorEmail(person, { readSiteFn: async (u) => (u === "https://teamservicestx.com/contact" ? { ok: true, text: "(512) 994-3000", email: "office@teamservicestx.com", pages: [u] } : { ok: false, reason: "x" }), searchFn: async () => ["https://teamservicestx.com/contact"] });
  assert.deepEqual([searched.email, searched.source], ["office@teamservicestx.com", "search"]);
  // 4. nothing found
  const none = await findContractorEmail(person, { readSiteFn: async () => ({ ok: false, reason: "HTTP 403" }) });
  assert.deepEqual(none, { email: null, website: null, source: "none", found: false });
  // a site that shows the phone but publishes no email is remembered as a website without an email
  const noMail = await findContractorEmail(person, { readSiteFn: async (u) => (u === "https://www.teamservices.com" ? { ok: true, text: "512-994-3000", email: null, emails: [], pages: [u] } : { ok: false }) });
  assert.deepEqual([noMail.email, noMail.found, noMail.website], [null, false, "https://www.teamservices.com"]);
  // a guess is not trusted when the contractor has no phone number to check
  const noPhone = await findContractorEmail({ role: "Contractor", company: "Team Services", phone: null }, { readSiteFn: async (u) => ({ ok: true, text: "x", email: "a@teamservices.com", pages: [u] }) });
  assert.equal(noPhone.found, false);
});

test("contractor email: the daily enrichment fills permits, remembers answers and respects the limit", async () => {
  const mk = (id, date, company, phone) => ({ source: "austin", source_id: id, city: "Austin", issued_on: date, people: [{ role: "Mechanical Contractor", company, name: null, phone, email: null, website: null }] });
  const permits = [mk("1", "2026-11-09", "Alpha Air", "(512) 000-0001"), mk("2", "2026-11-08", "Beta Heating", "(512) 000-0002"), mk("3", "2026-11-07", "Gamma Cooling", "(512) 000-0003"), mk("4", "2026-11-06", "Alpha Air", "(512) 000-0001")];
  const saved = [];
  const store = {
    loadCache: async () => [{ key: "phone:5120000002", email: "hi@beta.com", website: "https://beta.com", found: true, checked_at: new Date().toISOString() }],
    loadKnown: async () => new Map(),
    saveCache: async (rows) => void saved.push(...rows),
  };
  const sites = { "https://www.alphaair.com": { ok: true, text: "512-000-0001", email: "info@alphaair.com", pages: ["https://www.alphaair.com/"] } };
  const looked = [];
  const readSiteFn = async (u) => (looked.push(u), sites[u] ?? { ok: false, reason: "HTTP 404" });
  const out = await enrichPermits(permits, { store, limit: 1, readSiteFn });
  assert.deepEqual([out.contractors, out.looked], [3, 1], "Beta is remembered, so only one of the other two is looked up (the limit)");
  assert.equal(permits[0].people[0].email, "info@alphaair.com", "the newest permit's contractor was looked up first");
  assert.equal(permits[3].people[0].email, "info@alphaair.com", "and the same contractor on another permit gets it too");
  assert.equal(permits[1].people[0].email, "hi@beta.com", "a remembered answer is used without a lookup");
  assert.equal(permits[2].people[0].email, null);
  assert.equal(looked.filter((u) => u.includes("beta")).length, 0);
  assert.deepEqual(saved.map((r) => [r.key, r.found]), [["phone:5120000001", true]], "the new answer is remembered");
  assert.equal(out.permitsWithEmail, 3);
  // remembered "none found" answers are not looked up again within 30 days
  const again = await enrichPermits(permits, { store: { loadCache: async () => [{ key: "phone:5120000003", email: null, found: false, checked_at: new Date().toISOString() }, { key: "phone:5120000001", email: "info@alphaair.com", found: true, checked_at: new Date().toISOString() }, { key: "phone:5120000002", email: "hi@beta.com", found: true, checked_at: new Date().toISOString() }], loadKnown: async () => new Map() }, readSiteFn: async () => assert.fail("nothing to look up") });
  assert.equal(again.looked, 0);
});

await Promise.all(pending);
console.log(`${passed} permit tests passed`);
