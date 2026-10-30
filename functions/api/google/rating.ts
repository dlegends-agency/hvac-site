// GET /api/google/rating?slug=<listing slug>
// Fetches the live Google star rating and review count for a PAID, published listing that is connected to a Google place.
// Nothing is stored or cached (Google's terms do not allow it), so each call is one Places API request. Cap daily usage with a
// quota on the API key in Google Cloud: when the quota is reached this returns an empty result and the site simply hides the stars.
import { isPaidNow, placeRating } from "../../_lib/google";
import { db, type Env } from "../../_lib/stripe";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const onRequestGet = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.GOOGLE_PLACES_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return reply({ rating: null });

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return reply({ rating: null }, 400);

  const res = await db(env, `listings?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=google_place_id,plan,plan_until&limit=1`);
  const row = res.ok ? ((await res.json()) as { google_place_id: string | null; plan: string | null; plan_until: string | null }[])[0] : undefined;
  if (!row?.google_place_id || !isPaidNow(row)) return reply({ rating: null });

  try {
    return reply({ rating: await placeRating(env, row.google_place_id) });
  } catch {
    return reply({ rating: null });
  }
};
