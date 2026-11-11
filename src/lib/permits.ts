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
  source_url: string | null;
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
