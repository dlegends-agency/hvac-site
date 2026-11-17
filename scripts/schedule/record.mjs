// Run by the scrape workflows after the scrape: saves when it ran and whether it worked, so Admin > Schedule can show it and the next
// check knows it is done. It also closes the run in the run history (scrape_runs): how it ended and how many new leads it saved.
// Usage: node scripts/schedule/record.mjs permits|bids success|failure|cancelled STARTED_ISO [RUN_ROW_ID]
const [source, outcome, started, runRow] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !["permits", "bids"].includes(source)) process.exit(0);

const base = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1";
const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const status = outcome === "success" ? "success" : outcome === "cancelled" ? "cancelled" : "failed";
const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null;

/** How many rows a table has, optionally only those saved since a time. Null when it cannot be counted. */
async function count(table, since) {
  try {
    const res = await fetch(`${base}/${table}?select=id${since ? `&imported_at=gte.${encodeURIComponent(since)}` : ""}`, { method: "HEAD", headers: { ...headers, Prefer: "count=exact" } });
    const n = Number((res.headers.get("content-range") ?? "").split("/")[1]);
    return res.ok && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const body = { last_run_at: started || new Date().toISOString(), last_status: status, last_run_url: runUrl, run_requested: false };
try {
  const res = await fetch(`${base}/scrape_schedules?source=eq.${source}`, { method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(body) });
  console.log(res.ok ? `Recorded: ${body.last_status}.` : `Could not record the run (HTTP ${res.status}).`);
} catch (e) {
  console.log(`Could not record the run: ${e.message}`);
}

// The run history. Best effort: it does nothing if the table is not there yet.
if (runRow && /^\d+$/.test(runRow)) {
  const table = source === "permits" ? "public_permits" : "gov_bids";
  const [added, total] = await Promise.all([count(table, started), count(table)]);
  try {
    const res = await fetch(`${base}/scrape_runs?id=eq.${runRow}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status, finished_at: new Date().toISOString(), added: status === "success" ? added : added ?? 0, total, run_url: runUrl }),
    });
    console.log(res.ok ? `Run history: ${status}, ${added ?? "?"} new.` : `Could not update the run history (HTTP ${res.status}).`);
  } catch (e) {
    console.log(`Could not update the run history: ${e.message}`);
  }
}
