// Storage for the agent: Supabase (service role) in production, an in-memory adapter for dry runs and tests.

import { createClient } from "@supabase/supabase-js";
import { hostOf, phoneDigits } from "./util.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Everything the agent should not suggest again, as lookup sets. */
export function buildKnown({ listings = [], candidates = [], rejected = [] }) {
  const known = { externalIds: new Set(), hosts: new Set(), phones: new Set(), names: new Set() };
  for (const l of listings) {
    const host = hostOf(l.website ?? "");
    if (host) known.hosts.add(host);
    if (phoneDigits(l.phone)) known.phones.add(phoneDigits(l.phone));
    known.names.add(`${norm(l.business_name)}|${norm(l.city)}`);
  }
  for (const c of candidates) {
    known.externalIds.add(c.external_id);
    const host = hostOf(c.website ?? "");
    if (host) known.hosts.add(host);
    if (phoneDigits(c.phone)) known.phones.add(phoneDigits(c.phone));
  }
  for (const r of rejected) known.externalIds.add(r.external_id);
  return known;
}

export function isKnown(known, lead) {
  if (known.externalIds.has(lead.externalId)) return true;
  const host = hostOf(lead.website ?? "");
  if (host && known.hosts.has(host)) return true;
  if (phoneDigits(lead.phone) && known.phones.has(phoneDigits(lead.phone))) return true;
  return known.names.has(`${norm(lead.name)}|${norm(lead.city)}`);
}

export function createSupabaseDb(env) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  return {
    kind: "supabase",
    listJobs: async () => must(await sb.from("discovery_jobs").select("*").order("created_at")),
    getJob: async (id) => (must(await sb.from("discovery_jobs").select("*").eq("id", id)))[0] ?? null,
    loadKnown: async () =>
      buildKnown({
        listings: must(await sb.from("listings").select("business_name,city,phone,website")),
        candidates: must(await sb.from("listing_candidates").select("external_id,phone,website")),
        rejected: must(await sb.from("discovery_rejected").select("external_id")),
      }),
    insertCandidates: async (rows) => {
      if (rows.length) must(await sb.from("listing_candidates").upsert(rows, { onConflict: "external_id", ignoreDuplicates: true }));
    },
    updateJob: async (id, patch) => must(await sb.from("discovery_jobs").update(patch).eq("id", id)),
    // Businesses with a website but no email yet (directory listings and candidates), skipping any looked at in the last 30 days.
    listMissingEmail: async (limit) => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const recent = new Set(must(await sb.from("discovery_email_checks").select("ref").gt("checked_at", since)).map((r) => r.ref));
      const listings = must(await sb.from("listings").select("id,business_name,website").not("website", "is", null).or("email.is.null,email.eq.").order("created_at", { ascending: false }).limit(1000))
        .filter((l) => l.website && !recent.has(`listing:${l.id}`)).map((l) => ({ ref: `listing:${l.id}`, id: l.id, kind: "listing", name: l.business_name, website: l.website }));
      const candidates = must(await sb.from("listing_candidates").select("id,name,website").not("website", "is", null).is("email", null).limit(1000))
        .filter((c) => c.website && !recent.has(`candidate:${c.id}`)).map((c) => ({ ref: `candidate:${c.id}`, id: c.id, kind: "candidate", name: c.name, website: c.website }));
      return [...candidates, ...listings].slice(0, limit);
    },
    // Only fills an empty email: an address a contractor or an admin typed in is never overwritten.
    saveEmail: async (item, email) => {
      if (item.kind === "listing") must(await sb.from("listings").update({ email }).eq("id", item.id).or("email.is.null,email.eq."));
      else must(await sb.from("listing_candidates").update({ email }).eq("id", item.id).is("email", null));
    },
    markChecked: async (item, found) => must(await sb.from("discovery_email_checks").upsert({ ref: item.ref, found, checked_at: new Date().toISOString() }, { onConflict: "ref" })),
    startRun: async (jobId) => (must(await sb.from("discovery_runs").insert({ job_id: jobId, status: "running" }).select("id")))[0]?.id,
    finishRun: async (runId, patch) => must(await sb.from("discovery_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", runId)),
  };
}

export function createMemoryDb({ jobs = [], known = buildKnown({}), missing = [] } = {}) {
  const state = { candidates: [], runs: [], jobs, missing, saved: [], checked: new Map() };
  return {
    kind: "memory",
    state,
    listJobs: async () => state.jobs,
    getJob: async (id) => state.jobs.find((j) => j.id === id) ?? null,
    loadKnown: async () => known,
    insertCandidates: async (rows) => void state.candidates.push(...rows),
    updateJob: async (id, patch) => void Object.assign(state.jobs.find((j) => j.id === id) ?? {}, patch),
    listMissingEmail: async (limit) => state.missing.filter((m) => !state.checked.has(m.ref)).slice(0, limit),
    saveEmail: async (item, email) => void state.saved.push({ ref: item.ref, email }),
    markChecked: async (item, found) => void state.checked.set(item.ref, found),
    startRun: async () => {
      state.runs.push({ log: [] });
      return state.runs.length - 1;
    },
    finishRun: async (runId, patch) => void Object.assign(state.runs[runId], patch),
  };
}
