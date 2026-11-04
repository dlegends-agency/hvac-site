// GET /api/google/photo?slug=<listing slug>&name=<photo name from /api/google/rating>
// Redirects to Google's own short-lived image address for the business's Google photo, shown as its profile picture. Only for a PAID,
// published listing connected to Google, and only for a photo of that same place, so this cannot be used to fetch other pictures with our
// key. Nothing is stored or cached (Google's terms do not allow it).
import { isPaidNow, isPhotoName, photoUri } from "../../_lib/google";
import { db, type Env } from "../../_lib/stripe";

const none = (status = 404) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export const onRequestGet = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.GOOGLE_PLACES_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return none();

  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  const name = params.get("name") ?? "";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120 || !isPhotoName(name)) return none(400);

  const res = await db(env, `listings?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=google_place_id,plan,plan_until&limit=1`);
  const row = res.ok ? ((await res.json()) as { google_place_id: string | null; plan: string | null; plan_until: string | null }[])[0] : undefined;
  if (!row?.google_place_id || !isPaidNow(row) || !name.startsWith(`places/${row.google_place_id}/photos/`)) return none();

  try {
    const uri = await photoUri(env, name);
    return uri ? new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "no-store" } }) : none();
  } catch {
    return none();
  }
};
