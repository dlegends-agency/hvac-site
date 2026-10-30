// POST /api/google/find (Authorization: Bearer <Supabase access token>)
// Searches Google for the signed-in contractor's own business (by name and city) and returns up to 5 matches to choose from.
import { searchPlaces } from "../../_lib/google";
import { db, getUser, json, ownedListingId, type Env } from "../../_lib/stripe";

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.GOOGLE_PLACES_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Google ratings are not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const res = await db(env, `listings?id=eq.${encodeURIComponent(listingId)}&select=business_name,city,state&limit=1`);
  const row = res.ok ? ((await res.json()) as { business_name: string; city: string; state: string }[])[0] : undefined;
  if (!row) return json({ error: "Listing not found" }, 404);

  try {
    return json({ candidates: await searchPlaces(env, `${row.business_name} ${row.city} ${row.state}`) });
  } catch {
    return json({ error: "Google search failed" }, 502);
  }
};
