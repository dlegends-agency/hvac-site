# Permits import

Pulls recent **public building permits** from city open-data portals and saves them to the `public_permits` table, shown separately in **Admin > Permits**.

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

Property owners' names are never read or saved. Permit records are public, but nothing here contacts anyone.

## Run it

```bash
npm run permits:test                                    # offline tests
node scripts/permits/index.mjs --dry-run --per-city 10  # prints what it would save; needs no database
```

To save: run `supabase/schema-permits.sql` in the Supabase SQL Editor, then either

- GitHub **Actions > Permits import > Run workflow** (uses the repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; optional `SOCRATA_APP_TOKEN`, a free token from the portal that avoids throttling), or
- on your computer: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/permits/index.mjs --per-city 10`.

The same permit is never saved twice (`source` + the city's permit number).

## Files

- `classify.mjs`: `classifyTrade`, `classifyProperty`, `cleanDescription`, `summarize`, `dedupe`, `buildPermit`.
- `sources.mjs`: `fetchAustin`, `fetchDallas`, `mapAustin`, `mapDallas`, `dallasDate`, `SOURCES`.
- `index.mjs`: the command line.
- `test.mjs`: offline tests.
