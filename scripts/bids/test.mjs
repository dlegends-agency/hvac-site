// Offline tests for the SAM.gov bids importer. Run: npm run bids:test
import assert from "node:assert/strict";
import { columnIndex, hvacReason, isoOrNull, mapBid, summarizeBid } from "./classify.mjs";
import { csvRows } from "./csv.mjs";
import { daysLeft, dueText, bidTitle } from "../../src/lib/bids.ts";
import { scoreBid } from "../../src/lib/bid-score.ts";

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
const collect = async (source) => {
  const out = [];
  for await (const row of csvRows(source)) out.push(row);
  return out;
};

test("csv: quotes, doubled quotes, line breaks inside a field, CRLF and a missing final newline", async () => {
  const text = 'a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n1,,3';
  const expected = [["a", "b", "c"], ["x, y", 'he said "hi"', "line1\nline2"], ["1", "", "3"]];
  assert.deepEqual(await collect([text]), expected);
  // the same answer however the bytes are cut into pieces, even in the middle of a quote pair
  for (let size = 1; size <= 7; size++) {
    const pieces = [];
    for (let i = 0; i < text.length; i += size) pieces.push(Buffer.from(text.slice(i, i + size)));
    assert.deepEqual(await collect(pieces), expected, `pieces of ${size}`);
  }
  assert.deepEqual(await collect(['"a""",b\n']), [['a"', "b"]]);
});

const HEADER = ["NoticeId", "Title", "Sol#", "Department/Ind.Agency", "CGAC", "Sub-Tier", "FPDS Code", "Office", "AAC Code", "PostedDate", "Type", "BaseType", "ArchiveType", "ArchiveDate", "SetASideCode", "SetASide", "ResponseDeadLine", "NaicsCode", "ClassificationCode", "PopStreetAddress", "PopCity", "PopState", "PopZip", "PopCountry", "Active", "AwardNumber", "AwardDate", "Award$", "Awardee", "PrimaryContactTitle", "PrimaryContactFullname", "PrimaryContactEmail", "PrimaryContactPhone", "PrimaryContactFax", "SecondaryContactTitle", "SecondaryContactFullname", "SecondaryContactEmail", "SecondaryContactPhone", "SecondaryContactFax", "OrganizationType", "State", "City", "ZipCode", "CountryCode", "AdditionalInfoLink", "Link", "Description"];
const cols = columnIndex(HEADER);
const NOW = Date.parse("2026-11-14T00:00:00Z");
const row = (over = {}) => {
  const base = { NoticeId: "n1", Title: "Replace chiller, Houston VA", "Sol#": "36C257-26-AP-0001", "Department/Ind.Agency": "VETERANS AFFAIRS, DEPARTMENT OF", "Sub-Tier": "VETERANS AFFAIRS, DEPARTMENT OF", Office: "NCO 16", PostedDate: "2026-11-12 10:00:00", Type: "Solicitation", SetASideCode: "SDVOSBC", SetASide: "Service-Disabled Veteran-Owned Small Business (SDVOSB) Set-Aside", ResponseDeadLine: "2026-12-08T17:00:00-06:00", NaicsCode: "238220", ClassificationCode: "Z2DA", PopCity: "HOUSTON", PopState: "TX", PopZip: "77030", Active: "Yes", PrimaryContactFullname: "Pat Lee", PrimaryContactEmail: "Pat.Lee@va.gov", PrimaryContactPhone: "713-555-0100", Link: "https://sam.gov/workspace/contract/opp/n1/view", Description: "Replace the chiller." };
  const r = new Array(HEADER.length).fill("");
  for (const [k, v] of Object.entries({ ...base, ...over })) r[cols[k]] = v;
  return r;
};

test("a Texas HVAC solicitation becomes a bid", () => {
  const b = mapBid(row(), cols, { now: NOW });
  assert.equal(b.notice_id, "n1");
  assert.equal(b.city, "Houston");
  assert.equal(b.state, "TX");
  assert.equal(b.naics, "238220");
  assert.equal(b.set_aside_code, "SDVOSBC");
  assert.equal(b.response_due, "2026-12-08T23:00:00.000Z");
  assert.deepEqual(b.contacts, [{ name: "Pat Lee", email: "pat.lee@va.gov", phone: "713-555-0100", title: null }]);
  assert.match(b.relevance, /238220/);
  assert.equal(b.summary, "Solicitation (service-disabled veteran-owned set-aside): Replace chiller, Houston VA in Houston, TX, due Dec 8, 2026 (Veterans Affairs, Department Of).");
  assert.ok(!b.summary.includes("\n"));
});

test("what is dropped", () => {
  assert.equal(mapBid(row({ PopState: "CA" }), cols, { now: NOW }), null, "another state");
  assert.equal(mapBid(row({ Active: "No" }), cols, { now: NOW }), null, "no longer active");
  assert.equal(mapBid(row({ Type: "Award Notice" }), cols, { now: NOW }), null, "an award is not a lead");
  assert.equal(mapBid(row({ Type: "Justification" }), cols, { now: NOW }), null);
  assert.equal(mapBid(row({ Type: "Sale of Surplus Property" }), cols, { now: NOW }), null);
  assert.equal(mapBid(row({ ResponseDeadLine: "2026-11-01T00:00:00-05:00" }), cols, { now: NOW }), null, "the deadline has passed");
  assert.equal(mapBid(row({ NaicsCode: "541715", ClassificationCode: "AC13", Title: "Software research", Description: "Research." }), cols, { now: NOW }), null, "not HVAC");
  assert.equal(mapBid(row({ PostedDate: "2024-01-01 00:00:00" }), cols, { now: NOW }), null, "posted more than a year ago");
  const noDeadline = mapBid(row({ ResponseDeadLine: "" }), cols, { now: NOW });
  assert.equal(noDeadline.response_due, null, "no deadline is kept, shown as none listed");
  assert.equal(mapBid(row({ PopState: "", State: "TX" }), cols, { now: NOW }).state, "TX", "the buyer's state is used when no place of performance is given");
});

test("HVAC is recognised from the codes or the words", () => {
  assert.match(hvacReason({ naics: "238220", psc: "", title: "x", description: "" }), /238220/);
  assert.match(hvacReason({ naics: "333415", psc: "4120", title: "x", description: "" }), /4120/);
  assert.match(hvacReason({ naics: "", psc: "", title: "Army Enterprise HVAC Modernization", description: "" }), /title/);
  assert.match(hvacReason({ naics: "236220", psc: "Y1AA", title: "Design-Build Barracks", description: "new barracks including air conditioning and heating" }), /description/);
  assert.equal(hvacReason({ naics: "236220", psc: "Y1AA", title: "Paint a fence", description: "x ".repeat(2000) + "chiller" }), null, "only the start of a long description is read");
  assert.equal(hvacReason({ naics: "", psc: "", title: "Chilled water for pie", description: "" }), null);
});

test("dates, summary and title", () => {
  assert.equal(isoOrNull("2026-11-12 10:00:00"), "2026-11-12T10:00:00.000Z");
  assert.equal(isoOrNull(""), null);
  assert.equal(isoOrNull("garbage"), null);
  assert.equal(summarizeBid({ noticeType: "Sources Sought", setAsideCode: "", title: "HVAC repair.", city: "AUSTIN", state: "TX", responseDue: null, agency: "DEPT OF THE ARMY" }), "Sources Sought: HVAC repair in Austin, TX (Dept Of The Army).");
  assert.equal(bidTitle({ title: "CON | Z2DA | REPLACE OR CHILLERS | 580-23-105" }), "Replace Or Chillers | 580-23-105");
  assert.equal(bidTitle({ title: "J041--RFQ-SDVOSB-Metasys Building Automation System" }), "RFQ-SDVOSB-Metasys Building Automation System");
  assert.ok(bidTitle({ title: "word ".repeat(60) }).length <= 92);
});

test("scoring: a fresh small-business solicitation in a city we serve is hot; a stale open early notice elsewhere is cold", () => {
  const cover = { cities: new Set(["houston"]), stateCovered: true };
  const hot = scoreBid({ posted_at: "2026-11-12T10:00:00Z", response_due: "2026-12-08T23:00:00Z", set_aside: "SDVOSB", set_aside_code: "SDVOSBC", city: "Houston", notice_type: "Solicitation" }, cover, NOW);
  assert.equal(hot.tier, "hot");
  assert.equal(hot.score, 25 + 20 + 20 + 20 + 15);
  assert.equal(hot.parts.length, 5);
  assert.equal(hot.parts.reduce((s, p) => s + p.points, 0), hot.score);
  assert.match(hot.why, /^Just posted, enough time to prepare an offer, /);
  const cold = scoreBid({ posted_at: "2026-09-01T10:00:00Z", response_due: "2026-11-15T10:00:00Z", set_aside: null, set_aside_code: null, city: "El Paso", notice_type: "Special Notice" }, { cities: new Set(), stateCovered: false }, NOW);
  assert.equal(cold.tier, "cold");
  const noDeadline = scoreBid({ posted_at: "2026-11-12T10:00:00Z", response_due: null, set_aside: null, set_aside_code: null, city: "Dallas", notice_type: "Presolicitation" }, cover, NOW);
  assert.equal(noDeadline.daysLeft, null);
  assert.equal(daysLeft("2026-11-17T00:00:00Z", NOW), 3);
  assert.equal(dueText(0), "due today");
  assert.equal(dueText(null), "no deadline listed");
  assert.equal(dueText(-1), "closed");
});

await Promise.all(pending);
console.log(`${passed} bid tests passed`);
