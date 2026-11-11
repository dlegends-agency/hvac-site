# Permits import

Pulls recent **public HVAC permits** (heating, cooling and ventilation only) from city open-data portals and saves them to the `public_permits` table, shown separately in **Admin > Permits**, ranked **Hot, Warm and Cold**. It runs **every day at 8:00 AM Philippine time** (00:00 UTC) through `.github/workflows/permits-import.yml`. Permits for other trades are never kept: the importer skips them, removes any saved earlier, and the database refuses them.

## Hot, Warm and Cold

Each permit is scored from 0 to 100 in the admin page (so the freshness stays current): **fresh** (up to 35: 3 days or less is 35), **project value** (up to 25; no value listed is 0), **kind and size of the job** (up to 20: a new system or replacement beats a repair, commercial beats residential, a big job gets a bonus), and **service area** (20 if a published directory listing is in that city, 8 if we only have listings elsewhere in Texas). **Hot** is 65 or more (call this week), **Warm** 35 to 64 (follow up), **Cold** under 35 (skip). Each card says why. Austin and Dallas leave the project value blank on almost every HVAC permit (about 1 in 500 has one), so most are ranked on the other parts. The rules are in `src/lib/permit-score.ts`.

For each permit it:

1. names the **trade** (HVAC, Plumbing, Electrical, Roofing, Solar, Pool & Spa, Foundation, Irrigation, Demolition, Fence & Walls, Sign, Windows & Doors, General construction or Other). The permit type decides first (a "Mechanical" permit is HVAC); a general permit is read from what the work is.
2. reads the **project value** (a value under $100 is a placeholder and counts as "not listed").
3. marks it **residential or commercial** (the city's own label, then the permit type, then the land use; otherwise "unknown").
4. writes a **one-line summary** from those facts and the work description. These are fixed rules (no AI, no cost), so the same permit always reads the same.

## Cities

| City | Source | Notes |
| --- | --- | --- |
| Austin | [Issued Construction Permits](https://data.austintexas.gov/resource/3syk-w9eu) on data.austintexas.gov | open Socrata data |
| Dallas | [Building Permits](https://www.dallasopendata.com/resource/e7gq-4sah) on dallasopendata.com | open Socrata data; the issue date is text, so it is read month by month |
| Collin County | [Collin CAD Building Permits](https://data.texas.gov/resource/82ee-gbj5) on data.texas.gov | not added yet |
| Houston | none | Houston does not publish its permits as an open data feed, and its permitting site blocks automated access, so it is not included |

## People details

Each permit keeps the people the city publishes: the contractor's **role** (for example Mechanical Contractor), **company**, **contact name**, **phone**, **address**, city and ZIP, and the applicant when the city lists one. In Admin > Permits, click a permit to see them. Austin's open data has no **email addresses** and no **general contractor** (those are on the city's own People Details page, which sits behind a bot check that this importer does not bypass), and it cuts the street name off at 12 characters. Dallas lists only the contractor's name. The admin page fills in an email when the same phone number or business name is already in your directory ("from your directory"), and every permit links to the city record.

## Contractor emails

The city data has no emails, so every import also looks for each contractor's email, in this order, and stops at the first answer: (1) a business in your directory or the discovery candidates with the same **phone number or name**, (2) a **web search** for the company when `TAVILY_API_KEY` is set (free key from tavily.com, 1,000 searches a month, add it as a GitHub secret), (3) likely **website addresses** built from the company name (for example `teamservicestx.com`). A website only counts when the contractor's own **phone number is on it**, then its published email is read by the same code as the discovery agent (robots.txt respected, about one request a second). Answers, including "none found", are remembered for 30 days in `contractor_contacts`, so only new contractors are looked up each day (150 per run, `--email-limit`; `--no-emails` skips this step).

Without the search key about 1 contractor in 10 gets an email (name guessing is hit or miss, and many contractors' sites block automated visits or publish only a contact form). The search key is what makes it work for most. Some contractors publish no email at all.

Property owners' names are never read or saved. Permit records are public, but nothing here contacts anyone.

## Run it

```bash
npm run permits:test                                          # offline tests
node scripts/permits/index.mjs --dry-run --served Houston     # prints the ranked Hot/Warm/Cold list; needs no database
node scripts/permits/index.mjs --days 14 --per-city 500       # saves (needs the two Supabase variables below)
```

To save: run `supabase/schema-permits.sql` in the Supabase SQL Editor, then either

- GitHub **Actions > Permits import > Run workflow** (it also runs by itself every day; uses the repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; optional `SOCRATA_APP_TOKEN`, a free token from the portal that avoids throttling), or
- on your computer: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/permits/index.mjs --days 30 --per-city 500`.

The same permit is never saved twice (`source` + the city's permit number).

## Files

- `classify.mjs`: `classifyTrade`, `classifyProperty`, `cleanDescription`, `summarize`, `dedupe`, `buildPermit`.
- `sources.mjs`: `fetchAustin`, `fetchDallas`, `mapAustin`, `mapDallas`, `dallasDate`, `SOURCES`.
- `contacts.mjs`: `contactKey`, `domainGuesses`, `pageHasPhone`, `findContractorEmail`, `enrichPermits`, `makeSearch` (contractor emails).
- `index.mjs`: the command line (`--days`, `--per-city`, `--cities`, `--dry-run`, `--served`).
- `test.mjs`: offline tests.
