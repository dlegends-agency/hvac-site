// Pure helpers for the discovery function (no Deno or network APIs, so they can be unit tested).

export interface PlacesAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  addressComponents?: PlacesAddressComponent[];
}

export interface Candidate {
  place_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
}

export interface Job {
  id: string;
  query: string;
  location: string;
  max_results: number;
  frequency: "daily" | "weekly" | "manual";
  enabled: boolean;
  last_run_at: string | null;
}

export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.addressComponents",
  "nextPageToken",
].join(",");

const component = (place: Place, type: string, useShort = false): string | null => {
  const c = place.addressComponents?.find((a) => a.types?.includes(type));
  return (useShort ? c?.shortText : c?.longText) ?? null;
};

/** Maps a Places API (New) result to a candidate row. Returns null when the place has no usable name or id. */
export function toCandidate(place: Place): Candidate | null {
  const name = place.displayName?.text?.trim();
  if (!place.id || !name) return null;
  return {
    place_id: place.id,
    name: name.slice(0, 200),
    address: place.formattedAddress?.slice(0, 300) ?? null,
    city: (component(place, "locality") ?? component(place, "postal_town") ?? component(place, "sublocality_level_1"))?.slice(0, 100) ?? null,
    state: component(place, "administrative_area_level_1")?.slice(0, 100) ?? null,
    postal_code: component(place, "postal_code")?.slice(0, 20) ?? null,
    phone: place.nationalPhoneNumber?.slice(0, 40) ?? null,
    website: place.websiteUri?.slice(0, 300) ?? null,
    maps_url: place.googleMapsUri?.slice(0, 500) ?? null,
  };
}

const HOUR = 3_600_000;

/** A job is due when enabled, scheduled (not manual) and its interval has passed since the last run. */
export function isDue(job: Job, now: number): boolean {
  if (!job.enabled || job.frequency === "manual") return false;
  if (!job.last_run_at) return true;
  const interval = job.frequency === "daily" ? 23 * HOUR : 6.9 * 24 * HOUR;
  return now - new Date(job.last_run_at).getTime() >= interval;
}

export const searchText = (job: Pick<Job, "query" | "location">) => `${job.query} in ${job.location}`;
