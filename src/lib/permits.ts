/** A public building permit pulled from a city open-data portal (see scripts/permits). */
export interface PublicPermit {
  id: string;
  imported_at: string;
  source: string;
  source_id: string;
  city: string;
  permit_type: string | null;
  issued_on: string | null;
  trade: string;
  value_usd: number | null;
  property_class: "residential" | "commercial" | "unknown";
  summary: string;
  description: string | null;
  address: string | null;
  zip: string | null;
  contractor_name: string | null;
  /** Contractors and the applicant, with the details the city publishes. */
  people: PermitPerson[];
  source_url: string | null;
}

export interface PermitPerson {
  role: string;
  company: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** The contractor's own website, when the scrape found it. */
  website?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** A business in the directory that can be matched to a contractor on a permit. */
export interface DirectoryBusiness {
  id: string;
  business_name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
}

const digits = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const plainName = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().replace(/\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|lp|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** The directory listing for a contractor on a permit: the same phone number, or the same business name. Null when there is none. */
export function matchDirectory(person: Pick<PermitPerson, "company" | "name" | "phone">, directory: DirectoryBusiness[]): DirectoryBusiness | null {
  const phone = digits(person.phone);
  if (phone.length === 10) {
    const byPhone = directory.find((b) => digits(b.phone) === phone);
    if (byPhone) return byPhone;
  }
  const name = plainName(person.company ?? person.name);
  if (name.length >= 4) return directory.find((b) => plainName(b.business_name) === name) ?? null;
  return null;
}

export const PERMIT_CLASS_STYLE: Record<PublicPermit["property_class"], string> = {
  residential: "bg-green-100 text-green-800",
  commercial: "bg-blue-100 text-blue-800",
  unknown: "bg-slate-100 text-slate-600",
};

/** A short heading for a card: the work in a few words, or the permit type when there is no description. */
export function permitTitle(p: Pick<PublicPermit, "description" | "permit_type">): string {
  const text = (p.description ?? "")
    .replace(/\s+/g, " ")
    .replace(/\bper\b[^;]*\bpermit report\b[^;]*;?/gi, "")
    .replace(/^(e-?plan|express|qteam( qr)?)\s*[:-]?\s*/i, "")
    .replace(/^(residential|commercial) expedited review\s*-\s*/i, "")
    .replace(/[;,.\s]+$/g, "")
    .trim();
  if (!text) return p.permit_type ?? "HVAC permit";
  const clipped = text.length > 64 ? `${text.slice(0, 64).replace(/\s+\S*$/, "")}…` : text;
  // ALL CAPS descriptions are common; make them read normally.
  const body = clipped === clipped.toUpperCase() ? clipped.toLowerCase() : clipped;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/** "$128,571", or "Value not listed" when the city gave none. */
export const permitValue = (n: number | null) => (n === null || !Number.isFinite(Number(n)) ? "Value not listed" : `$${Math.round(Number(n)).toLocaleString("en-US")}`);
