// POST /api/recommend/submit   { slug, name, email, body, used, website }
// A customer recommends a published directory listing. The recommendation is always saved (as "pending"); the business reads it in its
// dashboard and decides whether to show it. If email sending is set up, a confirmation link is emailed to the customer too, and the
// recommendation then carries an "email confirmed" note. `website` is a hidden trap field for bots.
import { sendEmail } from "../../_lib/email";
import { checkRecommendation, hashIp, hashToken, newToken, renderConfirmEmail } from "../../_lib/recommend";
import { db, json, siteOrigin, type Env } from "../../_lib/stripe";

// Same reply whether or not this email already recommended this business, so the form cannot be used to look up who did.
const SAVED = { ok: true, message: "Thank you. Your recommendation was sent to the business, which decides whether to show it." };
const SAVED_CONFIRM = { ok: true, message: "Thank you. Check your email and open the link to confirm. The business reads every recommendation and decides whether to show it." };

const PER_EMAIL_PER_DAY = 3;
const PER_SENDER_PER_DAY = 6;
const UNCONFIRMED_PER_LISTING_PER_HOUR = 10;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_URL) return json({ error: "Recommendations are not available right now." }, 501);
  const emailOn = Boolean(env.RESEND_API_KEY && env.NOTIFY_FROM_EMAIL);

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof raw.website === "string" && raw.website.trim() !== "") return json(emailOn ? SAVED_CONFIRM : SAVED); // a bot filled the hidden field

  const checked = checkRecommendation(raw);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const r = checked.value;

  const found = await db(env, `listings?slug=eq.${encodeURIComponent(r.slug)}&status=eq.published&select=id,business_name&limit=1`);
  if (!found.ok) return json({ error: "Could not save your recommendation. Please try again." }, 502);
  const listing = ((await found.json()) as { id: string; business_name: string }[])[0];
  if (!listing) return json({ error: "That business could not be found." }, 404);

  // Limits, so the form cannot be used to flood one business or one inbox. The sender is identified only by a salted hash.
  const ip = request.headers.get("CF-Connecting-IP");
  const ipHash = ip ? await hashIp(ip, env.SUPABASE_SERVICE_ROLE_KEY) : null;
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const hour = new Date(Date.now() - 3600_000).toISOString();
  const [byEmail, byListing, bySender] = await Promise.all([
    db(env, `listing_recommendations?author_email=eq.${encodeURIComponent(r.email)}&created_at=gt.${encodeURIComponent(day)}&select=id&limit=${PER_EMAIL_PER_DAY + 1}`),
    db(env, `listing_recommendations?listing_id=eq.${listing.id}&email_confirmed_at=is.null&created_at=gt.${encodeURIComponent(hour)}&select=id&limit=${UNCONFIRMED_PER_LISTING_PER_HOUR + 1}`),
    ipHash
      ? db(env, `listing_recommendations?ip_hash=eq.${ipHash}&created_at=gt.${encodeURIComponent(day)}&select=id&limit=${PER_SENDER_PER_DAY + 1}`)
      : Promise.resolve(new Response("[]", { status: 200 })),
  ]);
  if (!byEmail.ok || !byListing.ok || !bySender.ok) return json({ error: "Could not save your recommendation. Please try again." }, 502);
  if (
    ((await byEmail.json()) as unknown[]).length >= PER_EMAIL_PER_DAY ||
    ((await byListing.json()) as unknown[]).length >= UNCONFIRMED_PER_LISTING_PER_HOUR ||
    ((await bySender.json()) as unknown[]).length >= PER_SENDER_PER_DAY
  ) {
    return json({ error: "Too many recommendations right now. Please try again later." }, 429);
  }

  const token = newToken();
  const tokenHash = await hashToken(token);
  const insert = await db(env, "listing_recommendations", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ listing_id: listing.id, author_name: r.shownName, author_email: r.email, body: r.body, token_hash: tokenHash, ip_hash: ipHash }),
  });
  if (insert.status === 409) return json(emailOn ? SAVED_CONFIRM : SAVED); // this email already recommended this business
  if (!insert.ok) return json({ error: "Could not save your recommendation. Please try again." }, 502);

  if (!emailOn) return json(SAVED);
  const link = `${siteOrigin(env, request)}/api/recommend/confirm?t=${token}`;
  try {
    await sendEmail(env, { to: r.email, ...renderConfirmEmail(listing.business_name, link) });
  } catch {
    // The recommendation is saved; only the confirmation email failed, so it simply stays "not confirmed".
    return json(SAVED);
  }
  return json(SAVED_CONFIRM);
};
