// Finds the public contact email of the contractors named on permits.
//
// The city data has no email addresses, so this works the way a person would, in this order, and stops at the first answer:
//   1. a business in your own directory or in the discovery candidates with the same phone number or name (already scraped),
//   2. a web search for the company, when TAVILY_API_KEY is set (free tier),
//   3. likely website addresses built from the company name (teamservicestx.com, mcculloughheatingandair.com ...).
// A website only counts when the contractor's own phone number is on it, so an email is never taken from a business that merely has a
// similar name. The email is read from that site by the same code as the discovery agent (robots.txt respected, one request a second).
// Answers are remembered in `contractor_contacts` for 30 days, including "none found", so a contractor is not looked up every day.

import { readSite } from "../discovery-agent/site.mjs";
import { bestEmail } from "../discovery-agent/email.mjs";
import { UA, cleanUrl, hostOf, isBlockedHost, mapConcurrent } from "../discovery-agent/util.mjs";

export const digits10 = (s) => {
  const d = String(s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? d : "";
};

const LEGAL = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|pllc|the|of|dba|d\/b\/a)\b/g;

/** "Team Services, LLC" becomes "team services". */
export const plainCompany = (s) =>
  String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(LEGAL, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** The key a contractor is remembered by: its phone number when it has one, otherwise its name. Empty when there is neither. */
export function contactKey(person) {
  const phone = digits10(person.phone);
  if (phone) return `phone:${phone}`;
  const name = plainCompany(person.company ?? person.name);
  return name.length >= 4 ? `name:${name}` : "";
}

/** Likely website addresses for a company name, most likely first. Only .com, at most `max`. */
export function domainGuesses(company, city = "", max = 6) {
  const words = plainCompany(company).split(" ").filter(Boolean);
  if (!words.length || words.join("").length < 4) return [];
  const noAnd = words.filter((w) => w !== "and");
  const join = (list) => list.join("");
  const out = [join(words), join(noAnd), join(words.map((w) => (w === "and" ? "n" : w))), noAnd.join("-"), `${join(noAnd)}tx`, `${join(noAnd)}hvac`];
  const citySlug = String(city).toLowerCase().replace(/[^a-z]/g, "");
  if (citySlug) out.push(`${join(noAnd)}${citySlug}`);
  const seen = new Set();
  return out
    .filter((d) => d.length >= 4 && d.length <= 60 && !seen.has(d) && seen.add(d))
    .slice(0, max)
    .map((d) => `https://www.${d}.com`);
}

/** True when the page shows the contractor's phone number (in any format). */
export const pageHasPhone = (text, phone) => {
  const want = digits10(phone);
  return Boolean(want) && String(text ?? "").replace(/\D/g, "").includes(want);
};

/**
 * Looks for one contractor's email. `known` maps a contact key to what the directory already has ({ email, website }).
 * `readSiteFn` and `searchFn` can be replaced in tests. Returns { email, website, source, found } and never throws.
 */
export async function findContractorEmail(person, { city = "", known = new Map(), readSiteFn = readSite, searchFn = null, guesses = 6 } = {}) {
  const key = contactKey(person);
  const nameKey = `name:${plainCompany(person.company ?? person.name)}`;
  const hit = known.get(key) ?? known.get(nameKey);
  if (hit?.email) return { email: hit.email, website: hit.website ?? null, source: "directory", found: true };

  // A site for this company: the directory's, a search result, then guesses from the name.
  const sites = [];
  if (hit?.website) sites.push({ url: hit.website, source: "directory" });
  if (searchFn) {
    try {
      for (const url of await searchFn(person, city)) sites.push({ url, source: "search" });
    } catch {
      // a search failure just means no search results
    }
  }
  for (const url of domainGuesses(person.company ?? person.name, city, guesses)) sites.push({ url, source: "guess" });

  const tried = new Set();
  for (const { url, source } of sites) {
    const host = hostOf(url);
    if (!host || tried.has(host) || isBlockedHost(host)) continue;
    tried.add(host);
    let site = await readSiteFn(url);
    // A guessed address that does not load may exist without the "www".
    if (!site?.ok && source === "guess" && /fetch failed/i.test(site?.reason ?? "")) site = await readSiteFn(url.replace("://www.", "://"));
    if (!site?.ok) continue;
    // Without a phone number to check, only a site the directory or a search gave us counts; a guessed one is not trusted.
    const confirmed = digits10(person.phone) ? pageHasPhone(site.text, person.phone) : source !== "guess";
    if (!confirmed) continue;
    const email = site.email ?? bestEmail(site.emails ?? [], url);
    return { email: email ?? null, website: site.pages?.[0] ?? url, source: source === "guess" ? "website" : source, found: Boolean(email) };
  }
  return { email: null, website: null, source: "none", found: false };
}

const FRESH_FOUND_DAYS = 90;
const FRESH_MISSING_DAYS = 30;
const isFresh = (row, now) => {
  const days = (now - Date.parse(row.checked_at)) / 86_400_000;
  return days < (row.found ? FRESH_FOUND_DAYS : FRESH_MISSING_DAYS);
};

/**
 * Fills in `email` and `website` on the contractors of these permits (newest permits first), looking up at most `limit` contractors that
 * are not already remembered. `store` is { loadCache(), loadKnown(), saveCache(rows) }; in a dry run, saveCache is left out.
 * Returns counts for the log.
 */
export async function enrichPermits(permits, { store, limit = 150, searchFn = null, readSiteFn = readSite, concurrency = 4, log = () => {}, now = Date.now() } = {}) {
  const cache = new Map((await store.loadCache()).map((r) => [r.key, r]));
  const known = await store.loadKnown();

  // The distinct contractors, in the order of the newest permit they appear on.
  const order = [...permits].sort((a, b) => (b.issued_on ?? "").localeCompare(a.issued_on ?? ""));
  const wanted = new Map();
  for (const p of order) {
    for (const person of p.people ?? []) {
      const key = contactKey(person);
      if (key && !wanted.has(key)) wanted.set(key, { key, person, city: person.city ?? p.city });
    }
  }
  const todo = [...wanted.values()].filter((w) => !(cache.has(w.key) && isFresh(cache.get(w.key), now))).slice(0, limit);
  log(`Contractor emails: ${wanted.size} contractors on these permits, ${wanted.size - todo.length} already known or recently checked, looking up ${todo.length}.`);

  const fresh = [];
  await mapConcurrent(todo, concurrency, async ({ key, person, city }) => {
    const r = await findContractorEmail(person, { city, known, searchFn, readSiteFn });
    const row = { key, company: person.company ?? null, phone: person.phone ?? null, email: r.email, website: r.website, source: r.source, found: r.found, checked_at: new Date(now).toISOString() };
    cache.set(key, row);
    fresh.push(row);
    log(`${r.found ? "Email found" : "No email"}: ${person.company ?? person.name}${r.email ? ` (${r.email}, ${r.source})` : ""}.`);
  });
  if (fresh.length && store.saveCache) await store.saveCache(fresh);

  // Put what is known onto every permit.
  let withEmail = 0;
  let people = 0;
  for (const p of permits) {
    for (const person of p.people ?? []) {
      const row = cache.get(contactKey(person));
      if (row) {
        person.email ??= row.email ?? null;
        person.website ??= row.website ?? null;
      }
      people++;
      if (person.email) withEmail++;
    }
  }
  const permitsWithEmail = permits.filter((p) => (p.people ?? []).some((x) => x.email)).length;
  log(`Contractor emails: ${permitsWithEmail} of ${permits.length} permits now have a contractor email (${withEmail} of ${people} people).`);
  return { contractors: wanted.size, looked: todo.length, found: fresh.filter((r) => r.found).length, permitsWithEmail };
}

/** A web search for the company (one Tavily request, free tier), when a key is set: the first few result websites. */
export function makeSearch(apiKey) {
  if (!apiKey) return null;
  return async (person, city) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": UA },
      body: JSON.stringify({ query: `${person.company ?? person.name} HVAC ${city} TX`, max_results: 5, search_depth: "basic" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r) => cleanUrl(r.url)).filter(Boolean);
  };
}
