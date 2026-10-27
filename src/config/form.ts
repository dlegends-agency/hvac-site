export interface CountryConfig {
  code: string;
  name: string;
  /** Postal code pattern; omit for "any non-empty value". */
  postalPattern?: RegExp;
  postalLabel: string;
  regionLabel: string;
  /** Allowed digit counts for a phone number (excluding country calling code). */
  phoneDigits: [number, number];
}

// Add countries here to make the form usable elsewhere. The US is the initial market.
export const countries: CountryConfig[] = [
  { code: "US", name: "United States", postalPattern: /^\d{5}(-\d{4})?$/, postalLabel: "ZIP code", regionLabel: "State", phoneDigits: [10, 10] },
  { code: "CA", name: "Canada", postalPattern: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, postalLabel: "Postal code", regionLabel: "Province", phoneDigits: [10, 10] },
];

export const defaultCountry = "US";

export const CONTACT_METHODS = ["Phone", "Text", "Email"] as const;
export const PROPERTY_TYPES = ["Residential", "Commercial"] as const;
export const PROPERTY_STATUSES = ["Homeowner", "Tenant", "Property Manager", "Other"] as const;

export const getCountry = (code: string): CountryConfig =>
  countries.find((c) => c.code === code) ?? countries[0];
