// Shared helpers for the discovery agent. Pure functions where possible so they can be tested offline.

export const SITE_URL = process.env.SITE_URL || "https://example.com";
export const BOT_NAME = "HVACHelpBot";
export const UA = `${BOT_NAME}/1.0 (+${SITE_URL}; business directory research)`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sites that are directories, lead-generation pages, social networks or manufacturers: never treated as a business's own website. */
export const BLOCKED_HOSTS = [
  "yelp.com", "angi.com", "angieslist.com", "homeadvisor.com", "bbb.org", "facebook.com", "instagram.com", "thumbtack.com", "porch.com",
  "yellowpages.com", "superpages.com", "mapquest.com", "manta.com", "expertise.com", "nextdoor.com", "linkedin.com", "youtube.com", "reddit.com",
  "pinterest.com", "x.com", "twitter.com", "tiktok.com", "buildzoom.com", "homeguide.com", "google.com", "goo.gl", "bing.com", "wikipedia.org",
  "energysage.com", "trane.com", "carrier.com", "lennox.com", "rheem.com", "bryant.com", "goodmanmfg.com", "yext.com", "chamberofcommerce.com",
  "birdeye.com", "trustpilot.com", "indeed.com", "glassdoor.com", "amazon.com", "homedepot.com", "lowes.com", "networx.com", "fixr.com",
  "consumeraffairs.com", "citysearch.com", "zoominfo.com", "dnb.com", "opencorporates.com", "houzz.com", "patch.com", "apple.com", "tripadvisor.com",
  "customerlobby.com", "guildquality.com", "d7leadfinder.com", "lantern.llc", "promptloop.com", "dispatchcore.io", "bestprosintown.com", "mylocalservices.com",
];

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export const isBlockedHost = (host) => !host || BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));

/** Normalizes anything that looks like a URL to an https:// origin+path, or null. */
export function cleanUrl(raw) {
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  try {
    const u = new URL(withScheme);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

export const phoneDigits = (p) => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export function formatPhone(p) {
  const d = phoneDigits(p);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

export const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

/** "TX" or "texas" -> "Texas"; unknown values are returned trimmed. */
export function stateName(s) {
  if (!s) return null;
  const t = String(s).trim();
  const up = t.toUpperCase();
  if (STATES[up]) return STATES[up];
  const full = Object.values(STATES).find((n) => n.toLowerCase() === t.toLowerCase());
  return full ?? t;
}

/** "Austin, TX" -> { city: "Austin", state: "Texas" } */
export function parseLocation(location) {
  const [city, st] = String(location).split(",").map((s) => s.trim());
  return { city: city || location, state: stateName(st) };
}

const HOUR = 3_600_000;

/** A job runs when queued by an admin ("Run now"), or when enabled and its schedule interval has passed. */
export function isDue(job, now = Date.now()) {
  if (job.run_requested) return true;
  if (!job.enabled || job.frequency === "manual") return false;
  if (!job.last_run_at) return true;
  const interval = job.frequency === "daily" ? 20 * HOUR : 6.5 * 24 * HOUR;
  return now - new Date(job.last_run_at).getTime() >= interval;
}

/** Runs fn over items with limited concurrency, preserving order. */
export async function mapConcurrent(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
