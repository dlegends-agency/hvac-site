// Keys used to recognise the same business in different sources, and to detect content changes. Pure.
import { createHash } from "node:crypto";
import { hostOf, phoneDigits } from "../discovery-agent/util.mjs";

const SUFFIX = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|pllc|the)\b/g;
export const normName = (s) => String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
const emailKey = (e) => String(e ?? "").trim().toLowerCase();

/** All keys that identify a business: phone, website host, email, name + city. Two records sharing any key are the same business. */
export function keysFor(b) {
  const keys = [];
  if (phoneDigits(b.phone)) keys.push(`phone:${phoneDigits(b.phone)}`);
  const host = hostOf(b.website ?? "");
  if (host) keys.push(`host:${host}`);
  if (emailKey(b.email)) keys.push(`email:${emailKey(b.email)}`);
  const n = normName(b.business_name ?? b.name);
  if (n.length >= 4 && b.city) keys.push(`name:${n}|${String(b.city).toLowerCase().trim()}`);
  return keys;
}

/** An index over existing listings: find(vendor) returns the listing it duplicates, or null. */
export function buildListingIndex(listings) {
  const byKey = new Map();
  for (const l of listings) for (const k of keysFor(l)) if (!byKey.has(k)) byKey.set(k, l);
  return {
    find(vendor) {
      for (const k of keysFor(vendor)) if (byKey.has(k)) return byKey.get(k);
      return null;
    },
    add(listing) {
      for (const k of keysFor(listing)) if (!byKey.has(k)) byKey.set(k, listing);
    },
  };
}

/** Changes when any detail a listing shows changes. */
export function contentHash(v) {
  const parts = [v.name, v.address, v.city, v.state, v.postal_code, v.phone, v.email, v.website, [...(v.nigp_items ?? [])].sort().join(","), [...(v.naics ?? [])].sort().join(","), [...(v.classifications ?? [])].sort().join(",")];
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
