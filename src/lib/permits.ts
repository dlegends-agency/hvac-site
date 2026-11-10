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

export const PERMIT_TRADES = ["HVAC", "Plumbing", "Electrical", "Roofing", "Solar", "Pool & Spa", "Foundation", "Irrigation", "Demolition", "Fence & Walls", "Sign", "Windows & Doors", "General construction", "Other"];

export const PERMIT_CLASS_STYLE: Record<PublicPermit["property_class"], string> = {
  residential: "bg-green-100 text-green-800",
  commercial: "bg-blue-100 text-blue-800",
  unknown: "bg-slate-100 text-slate-600",
};

/** "$128,571", or "Value not listed" when the city gave none. */
export const permitValue = (n: number | null) => (n === null || !Number.isFinite(Number(n)) ? "Value not listed" : `$${Math.round(Number(n)).toLocaleString("en-US")}`);
