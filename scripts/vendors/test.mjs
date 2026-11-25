// Offline tests for the vendor pipeline: node scripts/vendors/test.mjs
import assert from "node:assert/strict";
import { mapCmblVendor, parseClassesRaw, loadCmbl } from "./cmbl.mjs";
import { buildListingIndex, contentHash, keysFor, normName } from "./dedupe.mjs";
import { listable, refreshFields, vendorToListing } from "./listing.mjs";
import { matchVendors, scoreVendor } from "./match.mjs";
import { DEFAULT_MAP, MIN_VENDOR_SCORE, hvacScore, servicesFor, targetsFor } from "./nigp.mjs";
import { importCsv, mapSamEntity, fetchSam } from "./sba.mjs";

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
};

const pad = (s, n) => s.padEnd(n, " ");
const flags = (...items) => {
  const a = Array(99).fill(" ");
  for (const i of items) a[i - 1] = String(i % 10);
  return a.join("");
};
const NAMES = `WEB_VID,WEB_NAME_VENDOR_NAME,WEB_ADDR1,WEB_ADDR2,WEB_CITY,WEB_STATE,WEB_ZIP,WEB_ALT_CITY_ST_ZIP,WEB_PHONE,WEB_FAX,WEB_HUB_STATUS,WEB_COUNTY,WEB_DESC,WEB_VENDOR_NO,WEB_HUB_EXPIRE_DATE,WEB_CONTACT,WEB_TX_OFFICE_FLAG,WEB_EMAIL_ADDRESS,WEB_QISV_FLAG,WEB_SDV_FLAG,WEB_SMALL_BUS_FLAG,WEB_CMBL_REASON_OFF,WEB_HUB_CLASS_EXP_DATE,WEB_CATEGORY_CODE
"111","COOL BREEZE HEATING & AIR LLC","12 MAIN ST","STE 2","AUSTIN","TX",78701-1234,USA,512-555-0100,,A,TRAVIS,"HVAC service",900001,12/31/2027,"Pat Lee",Y,Pat@coolbreeze.com,,Y,Y,,,05,
"222","ACME OFFICE SUPPLY","1 ELM","","AUSTIN","TX",78701,USA,512-555-0111,,N,TRAVIS,"Paper",900002,,"Sam",,sam@acme.com,,,,,,05,
"333","DUCT PROS","9 OAK","","DALLAS","TX",75201,USA,214-555-0122,,N,DALLAS,"",900003,,"Dee",,dee@ductpros.com,,,Y,,,05,
"444","OKLAHOMA HVAC INC","9 OAK","","TULSA","OK",74101,USA,918-555-0133,,N,TULSA,"",900004,,"Ok",,ok@okhvac.com,,,,,,05,
"555","OLD HVAC CO","9 OAK","","AUSTIN","TX",78701,USA,512-555-0144,,N,TRAVIS,"",900005,,"Old",,old@oldhvac.com,,,,X,,05,
`;
const CLASSES = `CLASS_VID,CLASS_CODE,ALL_DISTS_FLAG,DIST_FLAGS,ALL_ITEMS_FLAG,ITEM_FLAGS,FILLER
"111","910"," ","1234567890123 567 9012345"," ","${flags(36)}","        "
"222","915"," ","1234567890123 567 9012345"," ","${flags(2)}","        "
"333","910"," ","1234567890123 567 9012345"," ","${flags(4)}","        "
"444","910"," ","1234567890123 567 9012345"," ","${flags(36)}","        "
"555","910"," ","1234567890123 567 9012345"," ","${flags(36)}","        "
`;

await test("NIGP item flags are decoded by position (item N = Nth character)", async () => {
  const codes = await parseClassesRaw(CLASSES);
  assert.deepEqual([...codes.get("111").items], ["910-36"]);
  assert.deepEqual([...codes.get("333").items], ["910-04"]);
});

await test("CMBL: only active Texas HVAC contractors are kept, with their details", async () => {
  const { vendors, total } = await loadCmbl(DEFAULT_MAP, { vendorsText: NAMES, classesText: CLASSES });
  assert.equal(total, 5);
  const names = vendors.map((v) => v.name).sort();
  assert.deepEqual(names, ["Cool Breeze Heating & Air Llc", "Duct Pros"], "supplies, other states and inactive vendors are dropped");
  const v = vendors.find((x) => x.source_id === "111");
  assert.equal(v.phone, "(512) 555-0100");
  assert.equal(v.email, "pat@coolbreeze.com");
  assert.equal(v.postal_code, "78701");
  assert.deepEqual(v.nigp_items, ["910-36"]);
  assert.ok(v.classifications.includes("HUB (Historically Underutilized Business)") && v.classifications.includes("Service-disabled veteran"));
  assert.equal(v.registration.cmbl_vendor_no, "900001");
});

await test("NAICS to NIGP mapping", () => {
  const t = targetsFor("238220");
  assert.ok(t.some((m) => m.nigp_class === "910" && m.nigp_item === "36" && m.weight === 100));
  assert.equal(targetsFor("999999").length, 0);
  assert.equal(hvacScore({ name: "Paper Co", nigp_items: ["915-02"] }), 0);
  assert.ok(hvacScore({ name: "Paper Co", nigp_classes: ["031"], nigp_items: [] }) < MIN_VENDOR_SCORE, "equipment-only 031 stays below the storage cutoff");
  assert.equal(hvacScore({ name: "X", naics: ["238220"] }), 100);
  assert.deepEqual(servicesFor({ name: "X", nigp_items: ["910-36", "910-04"] }), ["Heating, air conditioning and ventilation service", "Air duct cleaning"]);
});

const austin = { source: "cmbl", name: "A", city: "Austin", state: "Texas", postal_code: "78701", nigp_items: ["910-36"], nigp_classes: ["910"], classifications: ["Small business"], naics: [] };
const dallas = { ...austin, name: "B", city: "Dallas", postal_code: "75201" };
const duct = { ...austin, name: "Pros", nigp_items: ["910-04"] };

await test("matching: city beats state, wrong state never matches, weak codes need the city", () => {
  const opp = { kind: "bid", naics: "238220", state: "Texas", city: "Austin", zip: "78702" };
  const a = scoreVendor(austin, opp);
  const d = scoreVendor(dallas, opp);
  assert.ok(a.score > d.score, `${a.score} > ${d.score}`);
  assert.equal(scoreVendor(austin, { ...opp, state: "Oklahoma" }), null);
  assert.ok(scoreVendor(duct, opp).score >= 60, "duct cleaning in the same city matches");
  assert.ok(scoreVendor(duct, { ...opp, city: "Waco", zip: "76701" }).score < 60, "duct cleaning elsewhere in the state does not");
  assert.equal(scoreVendor({ ...austin, nigp_items: ["915-02"], nigp_classes: ["915"], name: "Paper" }, opp), null);
});

await test("matching: set-aside bids prefer qualifying vendors", () => {
  const opp = { kind: "bid", naics: "238220", state: "Texas", city: "Austin", setAsideCode: "SBA" };
  const ok = scoreVendor(austin, opp);
  const no = scoreVendor({ ...austin, classifications: [] }, opp);
  assert.ok(ok.score > no.score);
  assert.ok(ok.reasons.some((r) => /Small business set-aside/.test(r)));
  assert.equal(matchVendors([austin, dallas, duct], { kind: "permit", state: "Texas", city: "Austin" }).length, 3);
});

await test("duplicates are found by phone, website, email or name + city", () => {
  const listings = [{ id: "l1", business_name: "Cool Breeze Heating & Air, LLC", phone: "(512) 555-0100", city: "Austin" }, { id: "l2", business_name: "Other", website: "https://www.other.com/x", city: "Waco" }];
  const idx = buildListingIndex(listings);
  assert.equal(idx.find({ name: "Totally Different", phone: "512.555.0100" }).id, "l1");
  assert.equal(idx.find({ name: "Zed", website: "http://other.com" }).id, "l2");
  assert.equal(idx.find({ name: "COOL BREEZE HEATING & AIR LLC", city: "austin" }).id, "l1");
  assert.equal(idx.find({ name: "Nobody", phone: "999-999-9999", city: "Waco" }), null);
  assert.equal(normName("The Smith Co., Inc."), "smith");
  assert.ok(keysFor({ name: "Zed Air", city: "Waco", email: "A@B.com" }).includes("email:a@b.com"));
});

await test("content hash changes only when listing details change", () => {
  assert.equal(contentHash(austin), contentHash({ ...austin, registration: { x: 1 } }));
  assert.notEqual(contentHash(austin), contentHash({ ...austin, phone: "(512) 555-9999" }));
});

await test("imported listings are unclaimed, pending, public-safe and never carry the vendor's email", () => {
  const v = { ...austin, name: "Cool Breeze Heating & Air Llc", email: "pat@coolbreeze.com", phone: "(512) 555-0100", county: "Travis", address: "12 Main St", source_updated_on: "2026-11-25" };
  const l = vendorToListing(v, "abcd1234-0000-0000-0000-000000000000");
  assert.equal(l.status, "pending");
  assert.equal(l.unclaimed, true);
  assert.equal(l.source, "vendor");
  assert.equal(l.email, null);
  assert.match(l.slug, /^cool-breeze-heating-air-llc-austin-abcd$/);
  assert.equal(l.service_areas, "Austin, Travis County");
  assert.match(l.description, /not claimed it yet/);
  assert.match(l.attribution, /Texas Comptroller.*2026-11-25.*Unclaimed/);
  for (const k of ["user_id", "plan", "owner_id"]) assert.ok(!(k in l), `no ${k}`);
  assert.ok(!("status" in refreshFields(v)) && !("unclaimed" in refreshFields(v)), "a refresh never changes status or claim state");
  assert.equal(listable({ ...v, phone: null, website: null }), false);
  assert.equal(vendorToListing(v, "abcd1234", { publish: true }).status, "published");
});

await test("SBA export: columns are found by name, only Texas HVAC firms are kept", async () => {
  const csv = `Firm Name,UEI,Address,City,State,Zip Code,Phone,Email,Website,NAICS Codes,Certifications
"Lone Star Mechanical, LLC",UEI123456789,5 Elm St,Houston,TX,77002,(713) 555-0101,bid@lonestar.com,lonestarmech.com,"238220, 236220","8(a), Women-Owned Small Business"
"Pizza Place",UEI000000002,1 A St,Houston,TX,77002,,,,722511,
"Okie Air",UEI000000003,1 A St,Tulsa,OK,74101,,,,238220,HUBZone
`;
  const { vendors, total } = await importCsv(csv, DEFAULT_MAP);
  assert.equal(total, 3);
  assert.equal(vendors.length, 1);
  const v = vendors[0];
  assert.equal(v.source_id, "UEI123456789");
  assert.equal(v.website, "https://lonestarmech.com");
  assert.deepEqual(v.classifications.sort(), ["8(a)", "Woman-owned"]);
  assert.deepEqual(v.naics, ["238220", "236220"]);
});

await test("SAM.gov entity record -> vendor (official API shape), and no key means skipped", async () => {
  const e = {
    entityRegistration: { ueiSAM: "UEIABC", legalBusinessName: "Gulf Coast Air", registrationStatus: "Active", cageCode: "1A2B3" },
    coreData: { physicalAddress: { addressLine1: "9 Bay Rd", city: "Corpus Christi", stateOrProvinceCode: "TX", zipCode: "78401" }, businessTypes: { sbaBusinessTypeList: [{ sbaBusinessTypeDesc: "HUBZone Participant" }] }, entityInformation: { entityURL: "gulfcoastair.com" } },
    assertions: { goodsAndServices: { naicsList: [{ naicsCode: "238220" }] } },
  };
  const v = mapSamEntity(e, DEFAULT_MAP);
  assert.equal(v.state, "Texas");
  assert.deepEqual(v.classifications, ["HUBZone"]);
  assert.equal(v.email, null, "SAM.gov's public data has no email");
  const r = await fetchSam(DEFAULT_MAP, {});
  assert.equal(r.skipped, "no SAM_API_KEY");
  const calls = [];
  const fake = async (url) => (calls.push(url), { ok: true, status: 200, json: async () => ({ entityData: [e] }) });
  const got = await fetchSam(DEFAULT_MAP, { apiKey: "k", fetchFn: fake });
  assert.equal(got.vendors.length, 1);
  assert.equal(calls.length, 1, "a short page ends paging");
});

await test("claim evidence: exact email is strong, company domain and phone are weaker, free mail proves nothing", async () => {
  const { claimEvidence } = await import("../../src/lib/vendor-claim.ts");
  const v = { email: "pat@coolbreeze.com", phone: "(512) 555-0100", website: "https://www.coolbreeze.com" };
  assert.deepEqual(claimEvidence("Pat@CoolBreeze.com", null, v), { exactEmail: true, domain: true, phone: false });
  assert.deepEqual(claimEvidence("sam@coolbreeze.com", "512-555-0100", v), { exactEmail: false, domain: true, phone: true });
  assert.deepEqual(claimEvidence("someone@gmail.com", null, { ...v, email: "boss@gmail.com", website: null }), { exactEmail: false, domain: false, phone: false });
  assert.deepEqual(claimEvidence("a@b.com", null, null), { exactEmail: false, domain: false, phone: false });
});

console.log(`${passed} vendor tests passed`);
