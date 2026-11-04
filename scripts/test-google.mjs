// Offline tests for the Google Places helpers. Run: npm run test:google
import assert from "node:assert/strict";
import { isPaidNow, isPhotoName, isPlaceId, parseCandidates, parsePhoto, parseRating } from "../functions/_lib/google.ts";
import { onRequestGet as photo } from "../functions/api/google/photo.ts";

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
assert.equal(isPaidNow({ plan: "featured", plan_until: "2026-07-01T00:00:00Z" }, now), true);
assert.equal(isPaidNow({ plan: "featured", plan_until: "2026-05-01T00:00:00Z" }, now), false);
// --- photos
const name = "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/AUy1Yp3abc_-9";
assert.ok(isPhotoName(name) && !isPhotoName("places/x/photos/") && !isPhotoName("../places/a/photos/b") && !isPhotoName("places/a/photos/b/c") && !isPhotoName(null));
assert.deepEqual(parsePhoto({ photos: [{ name, authorAttributions: [{ displayName: "Acme HVAC" }] }, { name: "places/a/photos/b" }] }), { name, attribution: "Acme HVAC" });
assert.deepEqual(parsePhoto({ photos: [{ name }] }), { name, attribution: null });
for (const bad of [null, {}, { photos: [] }, { photos: [{ name: "nope" }] }]) assert.equal(parsePhoto(bad), null);

const env = { GOOGLE_PLACES_API_KEY: "k", SUPABASE_SERVICE_ROLE_KEY: "svc", VITE_SUPABASE_URL: "https://x.supabase.co" };
let listing = [{ google_place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4", plan: "featured", plan_until: null }];
let googleCalls = 0;
let mediaBody = { photoUri: "https://lh3.googleusercontent.com/p/abc=w400" };
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes("/rest/v1/listings")) return new Response(JSON.stringify(listing), { status: 200 });
  if (url.startsWith("https://places.googleapis.com/v1/places/") && url.includes("/media")) { googleCalls++; return new Response(JSON.stringify(mediaBody), { status: 200 }); }
  throw new Error(`unexpected fetch ${url}`);
};
const get = (q) => photo({ env, request: new Request(`https://site.test/api/google/photo?${q}`) });
let res = await get(`slug=acme-austin&name=${encodeURIComponent(name)}`);
assert.equal(res.status, 302); assert.equal(res.headers.get("Location"), "https://lh3.googleusercontent.com/p/abc=w400"); assert.equal(res.headers.get("Cache-Control"), "no-store");
googleCalls = 0;
res = await get(`slug=acme-austin&name=${encodeURIComponent("places/ChIJOTHERPLACE000000000/photos/abc")}`);
assert.equal(res.status, 404); assert.equal(googleCalls, 0, "a photo of another place is never fetched with our key");
res = await get("slug=acme-austin&name=nope"); assert.equal(res.status, 400);
res = await get(`slug=Bad Slug&name=${encodeURIComponent(name)}`); assert.equal(res.status, 400);
listing = [{ google_place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4", plan: "free", plan_until: null }];
res = await get(`slug=acme-austin&name=${encodeURIComponent(name)}`); assert.equal(res.status, 404, "free listings never use Google photos"); assert.equal(googleCalls, 0);
listing = [{ google_place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4", plan: "featured", plan_until: null }];
mediaBody = { photoUri: "https://evil.example.com/x.jpg" };
res = await get(`slug=acme-austin&name=${encodeURIComponent(name)}`); assert.equal(res.status, 404, "only Google image hosts are followed");
res = await photo({ env: { ...env, GOOGLE_PLACES_API_KEY: undefined }, request: new Request(`https://site.test/api/google/photo?slug=a&name=${encodeURIComponent(name)}`) }); assert.equal(res.status, 404);

console.log("google helpers: all passed");
