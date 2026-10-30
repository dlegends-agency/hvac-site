# Discovery agent (free)

Finds HVAC contractors for the locations you add in **Admin > Directory > Find businesses** and puts them in the review list. It costs nothing to run: no Google Cloud, no paid API.

## What it does

For each search (location + max results) it:

1. **Plans**: geocodes the location with OpenStreetMap Nominatim.
2. **Gathers leads**: HVAC businesses mapped on OpenStreetMap (Overpass API), plus web search results if `TAVILY_API_KEY` is set (free tier).
3. **Skips** anything already in your directory, already a candidate, or previously rejected (matched by website, phone and name).
4. **Checks each business's own website** (robots.txt respected, identifies itself as `HVACHelpBot`, about 1 request per second): reads structured data, `tel:` links, address and the services it offers, and whether it advertises 24/7 or emergency service.
5. **Decides**: drops directories, social pages, parts suppliers and sites that don't read like an HVAC contractor. Scores the rest (0-100 confidence). Details confirmed on the business's own site are marked **Verified**.
6. **Saves candidates** to Supabase and writes a run log you can read in the admin ("Agent activity").

Nothing is published automatically: an admin imports a candidate as a **pending** listing and publishes it after checking.

Optional free AI help: set `GEMINI_API_KEY` (Google AI Studio, no billing) or `GROQ_API_KEY` and the agent also asks a model to classify each site and extract fields. Website text is treated as untrusted data and the model's answer is validated field by field.

## Setup (about 10 minutes)

1. Run the latest `supabase/schema-discovery.sql` in the Supabase SQL Editor.
2. In GitHub: **Settings > Secrets and variables > Actions > New repository secret**:
   - `SUPABASE_URL`: your project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase > Project Settings > API > `service_role` key. Keep it only here; never put it in the website, Cloudflare variables or this repo.
   - `SITE_URL`: your public site address (sent in the bot's user agent so site owners can see who is visiting)
   - optional: `TAVILY_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`
3. The workflow `Discovery agent` then runs every 6 hours and works on any search that is due. You can also start it from **Actions > Discovery agent > Run workflow**.

"Run now" in the admin marks the search as queued. It runs on the next check, or immediately if you also set up the optional button below.

### Optional: instant "Run now"

In Cloudflare Pages > Settings > Environment variables add `GITHUB_REPO` (`owner/name`) and `GITHUB_TOKEN` (a fine-grained personal access token limited to this repository with **Actions: Read and write**). The admin button then starts the workflow through `functions/api/run-discovery.ts`, which first checks the caller is a signed-in admin.

## Run it yourself

```bash
npm run discover:test                                              # offline unit tests
node scripts/discovery-agent/index.mjs --dry-run --location "Austin, TX" --max 10   # prints what it would save; needs no database
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/discovery-agent/index.mjs  # run due searches for real
```

## Good to know

- **Cost**: GitHub Actions is free for public repositories and has a monthly free allowance for private ones. A run takes a few minutes.
- **GitHub pauses scheduled workflows after 60 days with no repository activity.** Re-enable it under the Actions tab if that happens.
- **OpenStreetMap data** is ODbL licensed. Candidates that come only from OpenStreetMap get an attribution note when imported. OpenStreetMap coverage of small contractors varies by area, so a quiet city may return few results; adding `TAVILY_API_KEY` widens the search.
- The public Overpass servers are sometimes slow or busy. The agent tries several mirrors and logs a failure rather than crashing.
- Phone numbers, addresses and services are read from public business pages, not guaranteed accurate. Always verify before publishing.
