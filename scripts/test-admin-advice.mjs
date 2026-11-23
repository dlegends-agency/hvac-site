// Offline tests for the admin Overview recommendations. Run: npm run test:admin-advice
import assert from "node:assert/strict";
import { adviceFor } from "../src/lib/admin-advice.ts";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();
const base = { now: NOW, newLeads: [], newMessages: 0, pendingListings: 0, pendingClaims: 0, permitsAt: hoursAgo(5), bidsAt: hoursAgo(5), visitors: 50, prevVisitors: 50, requests: 5, paying: 1, publishedNoEmail: 0, topFree: null, unmatched: 0, days: 30 };
const ids = (i) => adviceFor({ ...base, ...i }).map((a) => a.id);

assert.deepEqual(ids({}), ["clear"], "all quiet: one calm line");
assert.ok(ids({ newLeads: [{ created_at: hoursAgo(3) }] }).includes("stale-leads"), "a request that waited over 2 hours");
assert.ok(!ids({ newLeads: [{ created_at: hoursAgo(1) }] }).includes("stale-leads"), "a fresh one is not yet a problem");
assert.deepEqual(ids({ pendingListings: 2, pendingClaims: 1, newMessages: 1 }).slice(0, 2), ["listings", "claims"], "urgent items come first");
assert.ok(ids({ permitsAt: hoursAgo(60) }).includes("/admin/permits-stale"), "a source not imported for 2 days");
assert.ok(ids({ bidsAt: null }).includes("/admin/bids-never"), "a source never imported");
const down = adviceFor({ ...base, visitors: 30, prevVisitors: 50 }).find((a) => a.id === "traffic-down");
assert.ok(down && /40%/.test(down.title), "traffic down 40%");
assert.ok(ids({ visitors: 200, requests: 1 }).includes("conversion"), "a low request rate");
assert.ok(!ids({ visitors: 50, requests: 0 }).includes("conversion"), "too few visitors to judge");
const up = adviceFor({ ...base, paying: 0, topFree: { name: "Cool Air", slug: "cool-air", views: 40 } }).find((a) => a.id === "upsell");
assert.ok(up && up.level === "suggest" && up.to === "/directory/cool-air", "a busy free listing is the first Featured offer");
assert.equal(adviceFor({ ...base, paying: 2, topFree: { name: "X", slug: "x", views: 3 } }).some((a) => a.id === "upsell"), false, "no offer for a listing nobody visited");
console.log("admin advice: all checks passed");
