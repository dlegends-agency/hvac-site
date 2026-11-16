// POST /api/run-scrape  { source: "permits" | "bids" }  (Authorization: Bearer <Supabase access token>)
// Lets the admin "Run now" button on Admin > Schedule start a scrape straight away: it checks the caller is a signed-in admin, then starts
// the GitHub Actions workflow. Without GITHUB_TOKEN + GITHUB_REPO (the same settings as /api/run-discovery) it answers 501 and the admin page
// falls back to asking for a run, which the next 30-minute check starts.
interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  GITHUB_TOKEN?: string; // fine-grained token: Actions "Read and write" on this one repository
  GITHUB_REPO?: string; // owner/name, for example dlegends-agency/hvac-site
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const WORKFLOW = { permits: "permits-import.yml", bids: "bids-import.yml" } as const;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: "Run-now is not configured" }, 501);
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) return json({ error: "Supabase is not configured" }, 501);

  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required" }, 401);

  const body = (await request.json().catch(() => ({}))) as { source?: unknown };
  const source = body.source === "permits" || body.source === "bids" ? body.source : null;
  if (!source) return json({ error: "Unknown source" }, 400);

  // Ask Supabase (as this user) whether they are an admin, using the same is_admin() the database policies use.
  const check = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!check.ok || (await check.json()) !== true) return json({ error: "Admins only" }, 403);

  const dispatch = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${WORKFLOW[source]}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hvac-site-run-scrape",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!dispatch.ok) return json({ error: `GitHub refused the request (${dispatch.status})` }, 502);
  return json({ started: true });
};
