// Google Places API (New) helpers. Only the place ID is stored; ratings are fetched live when a listing page is viewed,
// because Google's terms do not allow storing or caching ratings.
import type { Env } from "./stripe";

export interface Candidate {
  id: string;
  name: string;
  address: string;
}

export interface Rating {
  rating: number;
  count: number;
  url: string | null;
}

export const isPlaceId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(v);

/** Candidate businesses from a Text Search response. Entries without an id or name are dropped. */
export function parseCandidates(data: unknown): Candidate[] {
  const places = (data as { places?: { id?: unknown; displayName?: { text?: unknown }; formattedAddress?: unknown }[] } | null)?.places ?? [];
  return places
    .filter((p) => isPlaceId(p.id) && typeof p.displayName?.text === "string")
    .map((p) => ({ id: p.id as string, name: p.displayName?.text as string, address: typeof p.formattedAddress === "string" ? p.formattedAddress : "" }))
    .slice(0, 5);
}

/** A usable rating from a Place Details response, or null (no rating, out of range, not a number). */
export function parseRating(data: unknown): Rating | null {
  const d = data as { rating?: unknown; userRatingCount?: unknown; googleMapsUri?: unknown } | null;
  if (typeof d?.rating !== "number" || !(d.rating >= 1 && d.rating <= 5)) return null;
  const count = typeof d.userRatingCount === "number" && d.userRatingCount >= 0 ? Math.floor(d.userRatingCount) : 0;
  const url = typeof d.googleMapsUri === "string" && /^https:\/\/([a-z0-9-]+\.)*google\.com\//i.test(d.googleMapsUri) ? d.googleMapsUri : null;
  return { rating: Math.round(d.rating * 10) / 10, count, url };
}

/** Same rule as the site: a paid plan counts only until plan_until. */
export function isPaidNow(listing: { plan?: string | null; plan_until?: string | null }, now = Date.now()): boolean {
  if (!listing.plan || listing.plan === "free") return false;
  return !listing.plan_until || new Date(listing.plan_until).getTime() > now;
}

const BASE = "https://places.googleapis.com/v1";

export async function searchPlaces(env: Env, query: string): Promise<Candidate[]> {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY ?? "", "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress" },
    body: JSON.stringify({ textQuery: query, maxResultCount: 5, regionCode: "US" }),
  });
  if (!res.ok) throw new Error(`Places search ${res.status}`);
  return parseCandidates(await res.json());
}

export async function placeRating(env: Env, placeId: string): Promise<Rating | null> {
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY ?? "", "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri" },
  });
  if (!res.ok) throw new Error(`Places details ${res.status}`);
  return parseRating(await res.json());
}
