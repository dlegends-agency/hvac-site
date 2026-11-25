// Matching across all four data sets: local businesses (Google), government vendors, bids and permits. Pure, tested offline.
import { digits10, plainCompany } from "../permits/contacts.mjs";
import { keysFor } from "./dedupe.mjs";
import { scoreVendor } from "./match.mjs";

const lc = (s) => String(s ?? "").trim().toLowerCase();

/** An index of records by identity keys (phone, website host, email, name + city). */
export function indexRecords(records) {
  const byKey = new Map();
  for (const r of records) for (const k of keysFor(r)) if (!byKey.has(k)) byKey.set(k, r);
  return { find: (probe) => { for (const k of keysFor(probe)) if (byKey.has(k)) return byKey.get(k); return null; } };
}

/** A permit's contractor as a record that keysFor understands. */
export const personRecord = (person, city) => ({ name: person.company ?? person.name, phone: person.phone, email: person.email, city });

/**
 * Fills the missing email of permit contractors from the Google businesses and government vendors that are the same company
 * (same phone, website, or name + city). Returns the permits plus how each email was found.
 */
export function enrichPermitContacts(permits, sources) {
  const idx = indexRecords(sources.flatMap((s) => s.records.map((r) => ({ ...r, _from: s.label }))));
  let filled = 0;
  const out = permits.map((p) => {
    const people = (p.people ?? []).map((person) => {
      const hit = idx.find(personRecord(person, p.city));
      const next = { ...person, email_source: person.email ? "permit data" : null, matched_business: hit?.name ?? null };
      if (hit) {
        if (!next.email && hit.email) { next.email = hit.email; next.email_source = `matched ${hit._from}`; filled++; }
        if (!next.phone && hit.phone) next.phone = hit.phone;
      }
      return next;
    });
    return { ...p, people };
  });
  return { permits: out, filled };
}

/** Same company in the Google list and the vendor list. Returns Map(business key -> vendor). */
export function linkBusinessesToVendors(businesses, vendors) {
  const idx = indexRecords(vendors);
  const links = new Map();
  for (const b of businesses) {
    const v = idx.find(b);
    if (v) links.set(b, v);
  }
  return links;
}

/** How well a local (Google) business fits a bid or permit: it must be in the same state; same city is the real signal. */
export function scoreBusiness(business, opp, linkedVendor = null) {
  if (lc(business.state) !== lc(opp.state)) return null;
  const reasons = [];
  let score = 25;
  if (lc(business.city) && lc(business.city) === lc(opp.city)) { score = 70; reasons.push(`Based in ${business.city}`); }
  else if (opp.zip && business.postal_code && String(opp.zip).slice(0, 3) === String(business.postal_code).slice(0, 3)) { score = 50; reasons.push("Nearby ZIP area"); }
  else reasons.push(`In ${business.state}`);
  if (linkedVendor) {
    score += 15;
    reasons.push("Also a registered Texas state vendor");
    // The vendor record can say more about the work: reuse its code fit for bids.
    if (opp.naics !== undefined) {
      const m = scoreVendor(linkedVendor, opp);
      if (m) { score += 10; reasons.push(...m.reasons.filter((r) => /NIGP|NAICS|set-aside/i.test(r))); }
    }
  }
  if (opp.contractorName && plainCompany(opp.contractorName) && plainCompany(opp.contractorName) === plainCompany(business.name)) { score = 100; reasons.unshift("Is the contractor on this permit"); }
  return { score: Math.min(100, score), reasons };
}

/** Top matches for one opportunity from a list of businesses. */
export function matchBusinesses(businesses, opp, { links = new Map(), threshold = 60, limit = 10 } = {}) {
  const out = [];
  for (const b of businesses) {
    const m = scoreBusiness(b, opp, links.get(b) ?? null);
    if (m && m.score >= threshold) out.push({ business: b, ...m });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export { digits10 };
