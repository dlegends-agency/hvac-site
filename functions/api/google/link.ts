// POST /api/google/link { placeId: string | null }  (Authorization: Bearer <Supabase access token>)
// Connects the contractor's listing to one of the Google matches (or disconnects it with null).
// The place must appear in a fresh search for the listing's own name and city, so an account cannot attach someone else's rating.
import { isPlaceId, searchPlaces } from "../../_lib/google";
import { db, getUser, json, ownedListingId, type Env } from "../../_lib/stripe";

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.GOOGLE_PLACES_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Google ratings are not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const body = (await request.json().catch(() => ({}))) as { placeId?: unknown };
  const target = encodeURIComponent(listingId);

  if (body.placeId !== null && !isPlaceId(body.placeId)) return json({ error: "Invalid place" }, 400);

  if (body.placeId !== null) {
    const res = await db(env, `listings?id=eq.${target}&select=business_name,city,state&limit=1`);
    const row = res.ok ? ((await res.json()) as { business_name: string; city: string; state: string }[])[0] : undefined;
    if (!row) return json({ error: "Listing not found" }, 404);
    try {
      const matches = await searchPlaces(env, `${row.business_name} ${row.city} ${row.state}`);
      if (!matches.some((m) => m.id === body.placeId)) return json({ error: "That business was not among the matches" }, 400);
    } catch {
      return json({ error: "Google search failed" }, 502);
    }
  }

  const update = await db(env, `listings?id=eq.${target}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ google_place_id: body.placeId }) });
  return update.ok ? json({ ok: true }) : json({ error: "Could not save" }, 500);
};
