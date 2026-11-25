// Lead sources. Both are free: OpenStreetMap (Nominatim + Overpass, no key) and an optional Tavily web search (free tier key).

import { cleanEmail } from "./email.mjs";
import { UA, cleanUrl, formatPhone, hostOf, isBlockedHost, sleep, stateName } from "./util.mjs";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function getJson(url, init = {}, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(130_000) });
      if (res.ok) return await res.json();
      last = new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      last = e;
    }
    await sleep(2000 * (i + 1));
  }
  throw last;
}

/** Geocodes a place name to a bounding box with Nominatim (free; keep to about one request per second). */
export async function geocode(location) {
  const data = await getJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&countrycodes=us`);
  const hit = data?.[0];
  if (!hit?.boundingbox) throw new Error(`Could not find "${location}" on OpenStreetMap`);
  const [south, north, west, east] = hit.boundingbox.map(Number);
  return { south, north, west, east, label: hit.display_name };
}

/** Maps one Overpass element to a lead, or null when it has no name. */
export function mapOsmElement(el) {
  const t = el.tags ?? {};
  if (!t.name) return null;
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null;
  const website = cleanUrl(t.website || t["contact:website"] || t.url);
  const host = hostOf(website ?? "");
  return {
    origin: "osm",
    externalId: `osm:${el.type}/${el.id}`,
    name: t.name,
    phone: formatPhone(t.phone || t["contact:phone"]),
    email: cleanEmail(t.email || t["contact:email"]),
    website: website && !isBlockedHost(host) ? website : null,
    street,
    city: t["addr:city"] ?? null,
    state: stateName(t["addr:state"]),
    postal_code: t["addr:postcode"] ?? null,
  };
}

/** HVAC businesses mapped on OpenStreetMap inside the place's bounding box. */
export async function findOsm(location, fixturePath = process.env.OSM_FIXTURE) {
  if (fixturePath) {
    // Test hook: use a saved Overpass response instead of calling the live API.
    const { readFileSync } = await import("node:fs");
    const saved = JSON.parse(readFileSync(fixturePath, "utf8"));
    return { leads: (saved.elements ?? []).map(mapOsmElement).filter(Boolean), area: `${location} (saved data)` };
  }
  const box = await geocode(location);
  const bb = `${box.south},${box.west},${box.north},${box.east}`;
  const query = `[out:json][timeout:110];(nwr["craft"="hvac"](${bb});nwr["shop"="hvac"](${bb}););out center tags;`;
  let data;
  let lastError;
  for (const endpoint of OVERPASS) {
    try {
      data = await getJson(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(query)}` }, 1);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!data) throw lastError ?? new Error("Overpass API unavailable");
  const leads = (data.elements ?? []).map(mapOsmElement).filter(Boolean);
  return { leads, area: box.label };
}

/** Optional web search through Tavily (free tier). Returns candidate business sites; directories are filtered out. */
export async function findWeb(location, queryText, apiKey, max = 10) {
  if (!apiKey) return [];
  const queries = [`${queryText} ${location}`, `air conditioning and heating repair ${location}`, `furnace repair ${location}`];
  const seen = new Set();
  const leads = [];
  for (const q of queries) {
    let data;
    try {
      data = await getJson("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: q, max_results: max, search_depth: "basic" }),
      });
    } catch {
      continue;
    }
    for (const r of data?.results ?? []) {
      const website = cleanUrl(r.url);
      const host = hostOf(website ?? "");
      if (!website || isBlockedHost(host) || seen.has(host)) continue;
      seen.add(host);
      leads.push({ origin: "web", externalId: `web:${host}`, name: String(r.title ?? host).slice(0, 120), phone: null, website, street: null, city: null, state: null, postal_code: null });
    }
  }
  return leads;
}

/** Maps one Google Places (New) result to a lead. Pure, so it can be tested offline. */
export function mapGooglePlace(p) {
  if (!p?.displayName?.text || p.businessStatus === "CLOSED_PERMANENTLY") return null;
  const part = (type, short = false) => {
    const c = (p.addressComponents ?? []).find((x) => x.types?.includes(type));
    return c ? (short ? c.shortText : c.longText) : null;
  };
  const street = [part("street_number"), part("route")].filter(Boolean).join(" ") || null;
  const website = cleanUrl(p.websiteUri);
  const host = hostOf(website ?? "");
  return {
    origin: "google",
    externalId: `google:${p.id}`,
    name: p.displayName.text,
    phone: formatPhone(p.nationalPhoneNumber),
    email: null, // Places has no email field; the agent reads it from the business's own website
    website: website && !isBlockedHost(host) ? website : null,
    street,
    city: part("locality") ?? part("postal_town"),
    state: stateName(part("administrative_area_level_1", true)),
    postal_code: part("postal_code"),
    category: p.primaryTypeDisplayName?.text ?? null,
    googleTypes: p.types ?? [],
    mapsUrl: p.googleMapsUri ?? null,
  };
}

const PLACES_FIELDS = [
  "places.id", "places.displayName", "places.addressComponents", "places.nationalPhoneNumber", "places.websiteUri",
  "places.primaryTypeDisplayName", "places.types", "places.businessStatus", "places.googleMapsUri", "nextPageToken",
].join(",");

/**
 * HVAC businesses from the official Google Places API (New) Text Search. Needs GOOGLE_PLACES_API_KEY (Cloud billing enabled).
 * Returns up to `max` leads (Google caps one search at 60 results, 20 per page).
 */
export async function findGoogle(location, queryText, apiKey, max = 60) {
  if (!apiKey) return [];
  const leads = [];
  let pageToken;
  do {
    const data = await getJson("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACES_FIELDS },
      body: JSON.stringify({ textQuery: `${queryText} in ${location}`, pageSize: 20, regionCode: "US", ...(pageToken ? { pageToken } : {}) }),
    });
    leads.push(...(data.places ?? []).map(mapGooglePlace).filter(Boolean));
    pageToken = data.nextPageToken;
  } while (pageToken && leads.length < max);
  return leads.slice(0, max);
}
