// The agent loop for one discovery job:
// plan -> gather leads (OpenStreetMap, optional web search) -> drop known ones -> visit each business's own site -> decide -> save candidates.

import { findOsm, findWeb } from "./sources.mjs";
import { readSite } from "./site.mjs";
import { extractWithLlm } from "./llm.mjs";
import { isKnown } from "./db.mjs";
import { hostOf, mapConcurrent, parseLocation, formatPhone, stateName } from "./util.mjs";

const SUPPLIER_RE = /(supply|supplies|wholesale|distribut\w*|parts|manufactur\w*)/i;
const MIN_SCORE = 4; // site must read like an HVAC contractor

/** Turns the evidence for one lead into a candidate row, or null when it should be dropped. Pure, so it can be tested offline. */
export function decide(lead, site, llm, location) {
  const notes = [];
  const target = parseLocation(location);
  const sourceNote = lead.origin === "osm" ? "Listed on OpenStreetMap" : "Found by web search";
  notes.push(sourceNote);

  if (SUPPLIER_RE.test(lead.name)) return { drop: `looks like a parts supplier, not a contractor (${lead.name})` };
  if (site && !site.ok) notes.push(`Website not read: ${site.reason}`);

  if (llm && !llm.isHvac) return { drop: `not an HVAC contractor per AI review (${lead.name})` };
  if (site?.ok && !llm && lead.origin === "web" && site.score < MIN_SCORE) return { drop: `site does not look like an HVAC contractor (${lead.name})` };
  if (lead.origin === "web" && !(site?.ok)) return { drop: `web lead could not be verified (${lead.name})` };

  const verified = Boolean(site?.ok && (llm ? llm.isHvac : site.score >= MIN_SCORE));
  const addr = site?.address;
  const phone = formatPhone(llm?.phone) ?? site?.phone ?? lead.phone ?? null;
  const city = llm?.city ?? addr?.city ?? lead.city ?? (lead.origin === "osm" ? target.city : null);
  const state = stateName(llm?.state ?? addr?.state) ?? lead.state ?? target.state;
  const street = llm?.street ?? addr?.street ?? lead.street ?? null;
  const postal = llm?.postal ?? addr?.postal ?? lead.postal_code ?? null;
  const services = [...new Set([...(llm?.services ?? []), ...(site?.ok ? site.services : [])])];
  const emergency = Boolean(llm?.emergency || (site?.ok && site.emergency));

  if (!phone) notes.push("No phone number found");
  if (lead.origin === "web" && llm && !llm.servesTarget) notes.push("May not serve the target area");
  if (verified) notes.push("Details read from the business's own website");

  let confidence = 20;
  if (lead.origin === "osm") confidence += 15;
  if (verified) confidence += 30;
  if (phone) confidence += 15;
  if (street && city) confidence += 10;
  if (services.length) confidence += 5;
  if (site?.hasJsonLd) confidence += 5;
  if (llm?.isHvac) confidence += 5;
  if (lead.origin === "web" && llm && !llm.servesTarget) confidence -= 20;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    row: {
      external_id: lead.externalId,
      origin: lead.origin,
      name: (llm?.name ?? lead.name).slice(0, 120),
      address: street,
      city,
      state,
      postal_code: postal,
      phone,
      website: lead.website,
      source_url: site?.ok ? site.pages[0] : lead.origin === "osm" ? `https://www.openstreetmap.org/${lead.externalId.slice(4)}` : lead.website,
      services,
      emergency,
      verified,
      confidence,
      notes: notes.join(". "),
    },
  };
}

/** Runs one job. `env` supplies optional keys (TAVILY_API_KEY, GEMINI_API_KEY, GROQ_API_KEY). */
export async function runJob(job, db, env, { log = () => {}, dryRun = false } = {}) {
  const lines = [];
  const say = (m) => {
    lines.push(m);
    log(m);
  };
  const runId = dryRun ? null : await db.startRun(job.id);
  let status = "ok";
  let saved = 0;
  try {
    say(`Plan: find up to ${job.max_results} "${job.query}" businesses in ${job.location}.`);
    const known = await db.loadKnown();
    let leads = [];

    try {
      const osm = await findOsm(job.location);
      say(`OpenStreetMap: ${osm.leads.length} HVAC businesses mapped around "${osm.area.split(",").slice(0, 2).join(",")}".`);
      leads.push(...osm.leads);
    } catch (e) {
      say(`OpenStreetMap lookup failed: ${e.message}`);
    }

    if (env.TAVILY_API_KEY) {
      const web = await findWeb(job.location, job.query, env.TAVILY_API_KEY, 10);
      say(`Web search: ${web.length} possible contractor websites.`);
      leads.push(...web);
    } else {
      say("Web search skipped (no TAVILY_API_KEY). Using OpenStreetMap only.");
    }

    const seen = new Set();
    leads = leads.filter((l) => {
      const key = hostOf(l.website ?? "") ?? l.externalId;
      if (seen.has(l.externalId) || (l.website && seen.has(`h:${key}`))) return false;
      seen.add(l.externalId);
      if (l.website) seen.add(`h:${key}`);
      return true;
    });
    const fresh = leads.filter((l) => !isKnown(known, l));
    say(`${leads.length} unique leads, ${leads.length - fresh.length} already known or rejected, ${fresh.length} to check.`);

    // Check at most 2x the target so a run stays short; leads with websites first (most verifiable).
    const queue = [...fresh].sort((a, b) => Number(Boolean(b.website)) - Number(Boolean(a.website))).slice(0, job.max_results * 2);
    const decided = await mapConcurrent(queue, 3, async (lead) => {
      const site = lead.website ? await readSite(lead.website) : null;
      const llm = site?.ok ? await extractWithLlm(env, { url: lead.website, text: site.text, location: job.location }) : null;
      const result = decide(lead, site, llm, job.location);
      if (result.drop) say(`Skipped: ${result.drop}.`);
      else say(`${result.row.verified ? "Verified" : "Found"}: ${result.row.name} (confidence ${result.row.confidence}).`);
      return result.row ?? null;
    });

    const rows = decided
      .filter(Boolean)
      .filter((r) => r.phone || r.website)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, job.max_results)
      .map((r) => ({ ...r, job_id: job.id }));

    if (!dryRun) await db.insertCandidates(rows);
    saved = rows.length;
    say(`Saved ${saved} new candidates for review.`);
    if (dryRun) log(JSON.stringify(rows.slice(0, 3), null, 2));
  } catch (e) {
    status = `error: ${e.message}`;
    say(`Run failed: ${e.message}`);
  }

  if (!dryRun) {
    await db.updateJob(job.id, { last_run_at: new Date().toISOString(), last_status: status, last_found: saved, run_requested: false });
    await db.finishRun(runId, { status, found: saved, log: lines.slice(-200) });
  }
  return { status, saved, lines };
}
