// Reads a business's OWN website politely (robots.txt respected) and extracts verifiable details.

import * as cheerio from "cheerio";
import { BOT_NAME, STATES, UA, formatPhone, phoneDigits, sleep } from "./util.mjs";

// ---------------------------------------------------------------- robots.txt
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** Most specific matching group wins (our bot name, then "*"); longest matching rule wins; Allow beats Disallow on ties. */
export function robotsAllows(groups, path) {
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && BOT_NAME.toLowerCase().includes(a)));
  const star = groups.filter((g) => g.agents.includes("*"));
  const rules = (mine.length ? mine : star).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp(`^${pattern}`).test(path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

const robotsCache = new Map();
async function allowedByRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let groups = [];
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      if (res.ok) groups = parseRobots(await res.text());
    } catch {
      // no robots.txt or unreachable: treat as allowed
    }
    robotsCache.set(u.origin, groups);
  }
  return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
}

async function fetchHtml(url) {
  if (!(await allowedByRobots(url))) return { blocked: true };
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    if (!/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) return { error: "not an HTML page" };
    const buf = await res.arrayBuffer();
    return { html: new TextDecoder().decode(buf.slice(0, 1_500_000)), finalUrl: res.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- extraction
const BUSINESS_TYPES = ["LocalBusiness", "HVACBusiness", "HomeAndConstructionBusiness", "Plumber", "Electrician", "GeneralContractor", "ProfessionalService", "Organization"];
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})\b/g;
const ADDRESS_RE = /(\d{1,6}\s+[A-Za-z0-9.#'’\- ]{3,40}?),?\s+([A-Z][A-Za-z.'’ -]{2,30}),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?/;

function flattenJsonLd(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => flattenJsonLd(v, out));
  else if (value && typeof value === "object") {
    out.push(value);
    if (value["@graph"]) flattenJsonLd(value["@graph"], out);
  }
  return out;
}

function addressFromJsonLd(a) {
  if (!a) return null;
  if (typeof a === "string") return parseAddressText(a);
  const street = a.streetAddress ?? null;
  const city = a.addressLocality ?? null;
  if (!street && !city) return null;
  return { street, city, state: a.addressRegion ?? null, postal: a.postalCode ?? null };
}

const STREET_WORD_RE = /^(Road|Rd|Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Parkway|Pkwy|Highway|Hwy|Court|Ct|Circle|Cir|Trail|Place|Pl|Suite|Ste|Loop)\.?\s+/;

export function parseAddressText(text) {
  const m = ADDRESS_RE.exec(text);
  if (!m || !STATES[m[3]]) return null;
  let street = m[1].trim();
  let city = m[2].trim();
  // "7101 Burleson Road Austin": the lazy street match stops early, so move leading street-type words back to the street.
  let lead;
  while ((lead = STREET_WORD_RE.exec(city)) && city.length > lead[0].length) {
    street = `${street} ${lead[1]}`;
    city = city.slice(lead[0].length).trim();
  }
  return { street, city, state: m[3], postal: m[4] };
}

const SERVICE_PATTERNS = [
  ["Air Conditioning Repair", /air conditioning|a\/c\b|\bac (repair|service|installation|unit)|cooling/i],
  ["Heating System Repair", /heating|furnace|heat pump|heater/i],
  ["Commercial HVAC Repair", /commercial/i],
  ["Thermostat Problems", /thermostat/i],
];
const EMERGENCY_RE = /24\s?\/\s?7|24[- ]hour|24 hours|emergency (service|repair|hvac|ac|a\/c|heating|cooling|calls?)/i;

export function deriveServices(text) {
  const services = SERVICE_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
  const emergency = EMERGENCY_RE.test(text);
  if (emergency && services.includes("Air Conditioning Repair")) services.push("Emergency AC Repair");
  if (emergency && services.includes("Heating System Repair")) services.push("Emergency Furnace Repair");
  return { services, emergency };
}

/** How strongly the page reads like an HVAC contractor (0 to about 25). */
export function hvacScore(text, title = "") {
  const t = text.toLowerCase();
  const count = (re) => (t.match(re) ?? []).length;
  let score =
    Math.min(count(/\bhvac\b/g), 6) + Math.min(count(/air conditioning|\ba\/c\b|\bac (repair|service|unit|installation)/g), 6) +
    Math.min(count(/heating|furnace|heat pump/g), 5) + Math.min(count(/duct|thermostat|refrigerant|cooling/g), 4);
  if (/hvac|air|heat|cool|comfort|furnace/i.test(title)) score += 3;
  return score;
}

export function extractFromHtml(html) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();

  let ld = null;
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      for (const item of flattenJsonLd(JSON.parse($(el).contents().text()))) {
        const types = [].concat(item["@type"] ?? []);
        if (!ld && types.some((t) => BUSINESS_TYPES.includes(t)) && (item.telephone || item.address)) ld = item;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  const telLinks = $("a[href^='tel:']").map((_, el) => decodeURIComponent($(el).attr("href").slice(4))).get();
  const contactLink = $("a[href]").filter((_, el) => /contact/i.test($(el).text()) || /contact/i.test($(el).attr("href") ?? "")).first().attr("href") ?? null;
  $("script,style,noscript,svg,iframe,template").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 40_000);

  let phone = formatPhone(telLinks.find((p) => phoneDigits(p))) ?? formatPhone(ld?.telephone);
  if (!phone) {
    const freq = new Map();
    for (const m of text.matchAll(PHONE_RE)) {
      const d = `${m[1]}${m[2]}${m[3]}`;
      freq.set(d, (freq.get(d) ?? 0) + 1);
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    phone = top ? formatPhone(top[0]) : null;
  }
  const address = addressFromJsonLd(ld?.address) ?? parseAddressText(text);
  const { services, emergency } = deriveServices(text);
  return { title, h1, text, phone, address, ldName: ld?.name ?? null, hasJsonLd: Boolean(ld), services, emergency, score: hvacScore(text, `${title} ${h1}`), contactLink };
}

/** Visits the homepage (and a contact page when phone/address are missing) and merges what it finds. */
export async function readSite(url, { politeMs = 800 } = {}) {
  const first = await fetchHtml(url);
  if (first.blocked) return { ok: false, reason: "robots.txt disallows reading this site" };
  if (!first.html) return { ok: false, reason: first.error ?? "could not be fetched" };
  const page = extractFromHtml(first.html);
  const pages = [first.finalUrl ?? url];

  if ((!page.phone || !page.address) && page.contactLink) {
    try {
      const next = new URL(page.contactLink, first.finalUrl ?? url);
      if (next.origin === new URL(first.finalUrl ?? url).origin && next.href !== (first.finalUrl ?? url)) {
        await sleep(politeMs);
        const second = await fetchHtml(next.href);
        if (second.html) {
          const more = extractFromHtml(second.html);
          pages.push(next.href);
          page.phone ??= more.phone;
          page.address ??= more.address;
          page.text = `${page.text} ${more.text}`.slice(0, 60_000);
          const merged = deriveServices(page.text);
          page.services = merged.services;
          page.emergency = merged.emergency;
        }
      }
    } catch {
      // ignore a bad contact link
    }
  }
  return { ok: true, pages, ...page };
}
