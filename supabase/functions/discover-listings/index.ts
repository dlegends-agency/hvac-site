// Supabase Edge Function: finds HVAC businesses with the official Google Places API (Text Search, new)
// and stores them as temporary "candidates" for an admin to review. It does NOT scrape Google Maps pages.
//
// Called two ways:
//   1. By pg_cron (see supabase/cron-discovery.sql) with the header  x-cron-secret: <CRON_SECRET>  -> runs due jobs.
//   2. By the admin UI (supabase.functions.invoke) with the signed-in admin's JWT -> runs one job or all enabled jobs now.
//
// Secrets (supabase secrets set ...): GOOGLE_PLACES_API_KEY, CRON_SECRET. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically. The service role key never leaves this function.
//
// Deploy with --no-verify-jwt because this function does its own authentication (cron secret or admin JWT).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { FIELD_MASK, isDue, searchText, toCandidate, type Candidate, type Job, type Place } from "./places.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_JOBS_PER_RUN = 10;
const PAGE_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");

  // --- authentication: cron secret OR signed-in admin
  const isCron = Boolean(cronSecret) && req.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: ok, error } = await userClient.rpc("is_admin");
    if (error || ok !== true) return json({ error: "Forbidden" }, 403);
  }
  if (!placesKey) return json({ error: "GOOGLE_PLACES_API_KEY is not set on the function." }, 500);

  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  const db = createClient(url, service, { auth: { persistSession: false } });

  // --- choose jobs
  let jobs: Job[];
  if (body.jobId) {
    const { data } = await db.from("discovery_jobs").select("*").eq("id", body.jobId);
    jobs = (data ?? []) as Job[];
  } else {
    const { data } = await db.from("discovery_jobs").select("*").eq("enabled", true);
    const all = (data ?? []) as Job[];
    jobs = isCron ? all.filter((j) => isDue(j, Date.now())) : all;
  }
  jobs = jobs.slice(0, MAX_JOBS_PER_RUN);

  const results: { jobId: string; found: number; status: string }[] = [];
  for (const job of jobs) {
    try {
      const places = await searchPlaces(placesKey, job);
      const candidates = places.map(toCandidate).filter((c): c is Candidate => c !== null);
      const fresh = await dropKnown(db, candidates);
      if (fresh.length) {
        const { error } = await db.from("listing_candidates").upsert(fresh.map((c) => ({ ...c, job_id: job.id })), { onConflict: "place_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      await db.from("discovery_jobs").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_found: fresh.length }).eq("id", job.id);
      results.push({ jobId: job.id, found: fresh.length, status: "ok" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("discovery_jobs").update({ last_run_at: new Date().toISOString(), last_status: `error: ${message}`.slice(0, 300), last_found: 0 }).eq("id", job.id);
      results.push({ jobId: job.id, found: 0, status: `error: ${message}` });
    }
  }
  return json({ ran: results.length, results });
});

/** Text Search (New), following next-page tokens until max_results or the end. */
async function searchPlaces(apiKey: string, job: Job): Promise<Place[]> {
  const out: Place[] = [];
  let pageToken: string | undefined;
  while (out.length < job.max_results) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({
        textQuery: searchText(job),
        pageSize: Math.min(PAGE_SIZE, job.max_results - out.length),
        languageCode: "en",
        regionCode: "US",
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { places?: Place[]; nextPageToken?: string };
    out.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, job.max_results);
}

/** Removes places that are already candidates, listings or rejected. */
async function dropKnown(db: ReturnType<typeof createClient>, candidates: Candidate[]): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.place_id);
  const [cand, listed, rejected] = await Promise.all([
    db.from("listing_candidates").select("place_id").in("place_id", ids),
    db.from("listings").select("google_place_id").in("google_place_id", ids),
    db.from("discovery_rejected").select("place_id").in("place_id", ids),
  ]);
  const known = new Set<string>([
    ...((cand.data ?? []) as { place_id: string }[]).map((r) => r.place_id),
    ...((listed.data ?? []) as { google_place_id: string }[]).map((r) => r.google_place_id),
    ...((rejected.data ?? []) as { place_id: string }[]).map((r) => r.place_id),
  ]);
  return candidates.filter((c) => !known.has(c.place_id));
}
