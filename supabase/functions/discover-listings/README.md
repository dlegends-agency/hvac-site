# discover-listings (Edge Function)

Finds HVAC businesses with the **official Google Places API (Text Search, new)** for the searches you define in the admin
(Directory → Find businesses), and saves them as temporary *candidates* for review. It does not scrape Google Maps pages.

## Set up (once)

1. **Google API key.** In Google Cloud: create a project, enable billing and the **Places API (New)**, create an API key and restrict it
   to the Places API (an application restriction is not possible for server calls, so keep the key secret). Set a daily quota/budget alert.
   Cost note: requesting phone and website uses a higher Places SKU, so keep `max_results` modest.
2. **Install the Supabase CLI** and log in: `npm i -g supabase` then `supabase login`, then `supabase link --project-ref pzjdtyszqboztatdfinb`.
3. **Set secrets** (never commit them):
   ```bash
   supabase secrets set GOOGLE_PLACES_API_KEY=your-google-key CRON_SECRET=a-long-random-string
   ```
4. **Deploy** (`--no-verify-jwt` because the function checks the cron secret or the admin's login itself):
   ```bash
   supabase functions deploy discover-listings --no-verify-jwt
   ```
5. Run `supabase/schema-discovery.sql`, then `supabase/cron-discovery.sql` (use the same `CRON_SECRET` value) in the SQL Editor.

## How it runs

- **Cron:** pg_cron calls the function daily at 09:00 UTC with the secret. Only enabled jobs that are due (daily/weekly) run.
- **Admin:** "Run now" in the admin calls it with your login; only admins are allowed.
- New places are skipped if they are already candidates, listings or rejected. Candidates older than 30 days are deleted by a second cron job.

## Google terms

Google's Maps Platform terms limit storing Places content (only the place ID may be kept long term) and forbid scraping. That is why candidates expire
after 30 days, and why importing a candidate creates a *pending* listing that you must verify on the business's own website before publishing.
Read the current terms and decide what is acceptable for your use. This is not legal advice.
