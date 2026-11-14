# Bids import (SAM.gov)

The second lead source. It keeps the **open federal contract notices for HVAC work in Texas** from [SAM.gov](https://sam.gov), the government's contracting site, in the `gov_bids` table. Building permits (the first lead source) are a separate table and a separate importer (`scripts/permits`). Both feed the admin and the contractor dashboard.

- **Admin > Government bids**: three columns, Hot, Warm and Cold, with a detail panel for each bid.
- **Contractor dashboard > Opportunities**: the same bids (and the permits) for your business users, scored for their city. A banner on their dashboard says how many are hot.
- Runs **every day at 8:30 AM Philippine time** (00:30 UTC) through `.github/workflows/bids-import.yml`.

## Where the data comes from

SAM.gov publishes the government's own open-data extract of all contract opportunities, refreshed every night (about 220 MB, no key or login needed): `https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv`. It is read as a stream (never saved to disk) in about a minute and a half. SAM.gov's own web pages are not scraped, and nothing is bypassed.

## What is kept

A notice is kept when it is **active**, its **place of performance is in Texas**, it is still asking for something (solicitation, combined synopsis/solicitation, presolicitation, sources sought, special notice, request for information; awards, justifications and surplus sales are dropped), its **deadline has not passed**, and it is **HVAC work**: NAICS 238220, an HVAC product or service code (J041, N041, 4120, 4510 ...), or HVAC words in the title or the start of the description. The same notice posted several times is kept once (the newest). Notices that close or are cancelled are removed on the next run.

## The score (0 to 100)

Freshness (25), time left to respond (20: a week or more is best, a day or two is hard to meet), small-business set-aside (20), place (20: in a city the business serves; 8 for elsewhere in Texas) and kind of notice (15: an open solicitation is best). **Hot** is 65 or more, **Warm** 35 to 64, **Cold** under 35. The rules are in `src/lib/bid-score.ts`.

## Run it

```bash
npm run bids:test                              # offline tests
node scripts/bids/index.mjs --dry-run          # reads the real file and prints the open Texas HVAC notices; needs no database
node scripts/bids/index.mjs --state TX         # saves (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
```

To save, run `supabase/schema-bids.sql` in the Supabase SQL Editor (after `schema-permits.sql`), then GitHub **Actions > Bids import > Run workflow**. It uses the repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` that the other importers already use.

## Files

- `csv.mjs`: `csvRows` (a streaming CSV reader).
- `classify.mjs`: `columnIndex`, `mapBid`, `hvacReason`, `summarizeBid`, `isoOrNull`.
- `index.mjs`: the command line.
- `test.mjs`: offline tests.
