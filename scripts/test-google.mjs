// Offline tests for the Google Places helpers. Run: npm run test:google
import assert from "node:assert/strict";
import { isPaidNow, isPlaceId, parseCandidates, parseRating } from "../functions/_lib/google.ts";

assert.ok(isPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4") && !isPlaceId("short") && !isPlaceId("../etc/passwd") && !isPlaceId(null));

const cands = parseCandidates({ places: [
  { id: "ChIJN1t_tDeuEmsRUsoyG83frY4", displayName: { text: "Acme HVAC" }, formattedAddress: "1 Main St, Austin, TX" },
  { id: "bad id!", displayName: { text: "Nope" } },
  { id: "ChIJ0000000000000000000000", displayName: {} },
  { id: "ChIJ1111111111111111111111", displayName: { text: "No address" } },
] });
assert.deepEqual(cands.map((c) => c.name), ["Acme HVAC", "No address"]);
assert.equal(cands[1].address, "");
assert.deepEqual(parseCandidates(null), []);
assert.equal(parseCandidates({ places: Array.from({ length: 9 }, (_, i) => ({ id: `ChIJ${String(i).padStart(20, "0")}`, displayName: { text: `B${i}` } })) }).length, 5);

assert.deepEqual(parseRating({ rating: 4.76, userRatingCount: 128.9, googleMapsUri: "https://maps.google.com/?cid=1" }), { rating: 4.8, count: 128, url: "https://maps.google.com/?cid=1" });
assert.equal(parseRating({ rating: 4.5, googleMapsUri: "https://evil.example.com/google.com/" }).url, null);
assert.equal(parseRating({ rating: 4.5 }).count, 0);
for (const bad of [null, {}, { rating: "5" }, { rating: 0 }, { rating: 5.5 }, { rating: NaN }]) assert.equal(parseRating(bad), null);

const now = Date.parse("2026-06-01T00:00:00Z");
assert.equal(isPaidNow({ plan: "free" }, now), false);
assert.equal(isPaidNow({ plan: null }, now), false);
assert.equal(isPaidNow({ plan: "featured", plan_until: null }, now), true);
assert.equal(isPaidNow({ plan: "premium", plan_until: "2026-07-01T00:00:00Z" }, now), true);
assert.equal(isPaidNow({ plan: "premium", plan_until: "2026-05-01T00:00:00Z" }, now), false);
console.log("google helpers: all passed");
