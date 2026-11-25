# Government vendor discovery

Finds HVAC vendors in **official government files**, matches them to the bids and permits the app already collects, and adds the matches to the Local Contractors directory as **unclaimed** listings.

## Sources (and why these)

| Source | How it is read | Notes |
| --- | --- | --- |
| Texas Comptroller **CMBL** | The Comptroller's own download files (`web_name.csv`, `vnr_clas.csv`, refreshed nightly) at comptroller.texas.gov/purchasing/downloads | Name, address, phone, **email**, HUB / veteran / small-business flags, NIGP class and item codes. The search form is not scraped (it is for people and exports at most 1,000 vendors). |
| **SAM.gov** certified businesses | The official Entity Management API, needs a free `SAM_API_KEY` | NAICS codes, SBA certifications, address, website. No email or phone in the public data. Mapping follows SAM.gov's v3 response; it has been tested with sample data only. |
| **SBA Small Business Search** | An export you save yourself: `node scripts/vendors/index.mjs --sba-file export.csv` | search.certifications.sba.gov has no public API or bulk download, so it is not scraped. Column names are detected automatically. |

## What happens

1. **Sync**: vendors that look like HVAC contractors (NIGP 910-36 HVAC services, 910-04 duct cleaning, 910-17 controls, 936-67 refrigeration, NAICS 238220, or HVAC in the name) are saved to `gov_vendors` with source, first-seen, last-seen and last-changed dates. Unchanged vendors only get a new last-seen date; changed ones are updated; vendors that left the source file are marked inactive.
2. **Match**: `naics_nigp_map` turns a bid's NAICS code (permits count as NAICS 238220) into the NIGP codes that fit. A vendor scores on code fit (70%), location (same city, nearby ZIP, same state) and set-aside qualification. Score 60+ is saved to `vendor_matches` with the reasons. Edit the map in the database to change it.
3. **Import**: matched vendors become listings with `source = 'vendor'`, `unclaimed = true`, status **pending** (set `VENDOR_AUTO_PUBLISH=1` to publish directly). Duplicates (same phone, website host, email, or name + city) are linked to the existing listing and never changed. A later sync refreshes a listing only while it is unclaimed.

## What it never does

No login, subscription, plan or lead routing is created for a vendor. The vendor's email is kept in `gov_vendors` (admin only) and is not shown on the public listing. The public page says the profile is unclaimed and not a customer.

## Claiming

A business signs in at `/contractor/login`, finds its listing and files a claim (existing flow). Admin > Directory > Claims shows the contact on file in the government record and whether the claimant's email matches it exactly (strong), uses the company domain, or gave the same phone. Approving creates the ownership row, and a trigger clears `unclaimed`.

## Run it

```bash
npm run vendors:test                          # offline tests
node scripts/vendors/index.mjs --dry-run      # read CMBL and print counts, saves nothing
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/vendors/index.mjs
```

Run `supabase/schema-vendors.sql` once first. The GitHub workflow `Vendor sync` runs after the permits and bids imports and nightly. Admin: Directory > Government vendors.
