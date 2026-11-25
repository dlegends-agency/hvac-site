// Turns a vendor into an UNCLAIMED directory listing. Pure.
// Rules: the listing is created pending (an admin publishes it), carries no login, plan or lead routing, says plainly that the business
// has not claimed it, and never shows the vendor's email (it stays in gov_vendors for admin and claim checks).
import { servicesFor } from "./nigp.mjs";

export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const SOURCE_LABEL = { cmbl: "Texas Comptroller Centralized Master Bidders List (CMBL)", sba: "SBA Small Business Search", sam: "SAM.gov" };

export function vendorToListing(v, id, { publish = false } = {}) {
  const services = servicesFor(v);
  const certs = (v.classifications ?? []).filter(Boolean);
  const description = [
    `${v.name} appears in public government vendor records (${SOURCE_LABEL[v.source] ?? v.source}) for heating, air conditioning and ventilation work.`,
    certs.length ? `Listed classifications: ${certs.join(", ")}.` : "",
    "This profile was created from public records. The business has not claimed it yet.",
  ].filter(Boolean).join(" ");
  return {
    id,
    slug: `${slugify(`${v.name} ${v.city}`)}-${id.slice(0, 4)}`,
    status: publish ? "published" : "pending",
    source: "vendor",
    unclaimed: true,
    business_name: v.name.slice(0, 120),
    description: description.slice(0, 2000),
    services,
    emergency_service: false,
    phone: v.phone,
    email: null,
    website: v.website,
    address: v.address?.slice(0, 200) ?? null,
    city: v.city,
    state: v.state,
    postal_code: v.postal_code,
    service_areas: [v.city, v.county ? `${v.county} County` : null].filter(Boolean).join(", ").slice(0, 500),
    source_url: v.source === "cmbl" ? "https://mycpa.cpa.state.tx.us/tpasscmblsearch/tpasscmblsearch.do" : v.source === "sba" ? "https://search.certifications.sba.gov/" : "https://sam.gov/",
    attribution: `Public records: ${SOURCE_LABEL[v.source] ?? v.source}, updated ${v.source_updated_on ?? "recently"}. Unclaimed profile.`,
    vendor_synced_at: new Date().toISOString(),
  };
}

/** The listing columns a later sync may refresh on a listing that is still unclaimed. */
export function refreshFields(v) {
  const l = vendorToListing(v, "0000xxxx");
  const { business_name, address, city, state, postal_code, phone, website, services, service_areas, attribution, description, vendor_synced_at } = l;
  return { business_name, address, city, state, postal_code, phone, website, services, service_areas, attribution, description, vendor_synced_at };
}

/** Whether a vendor can be listed at all: it needs a city and state, and a way to reach the business. */
export const listable = (v) => Boolean(v.name && v.city && v.state && (v.phone || v.website));
