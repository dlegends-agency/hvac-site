// Run by the scrape workflows after the scrape: saves when it ran and whether it worked, so Admin > Schedule can show it and the next
// check knows it is done. Usage: node scripts/schedule/record.mjs permits|bids success|failure|cancelled STARTED_ISO
const [source, outcome, started] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !["permits", "bids"].includes(source)) process.exit(0);

const body = {
  last_run_at: started || new Date().toISOString(),
  last_status: outcome === "success" ? "success" : outcome === "cancelled" ? "cancelled" : "failed",
  last_run_url: GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null,
  run_requested: false,
};
try {
  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/scrape_schedules?source=eq.${source}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  console.log(res.ok ? `Recorded: ${body.last_status}.` : `Could not record the run (HTTP ${res.status}).`);
} catch (e) {
  console.log(`Could not record the run: ${e.message}`);
}
