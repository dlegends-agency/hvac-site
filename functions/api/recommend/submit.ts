// POST /api/recommend/submit   { slug, name, email, body, used, website }
// A customer recommends a published directory listing. The recommendation is saved privately and a confirmation link is emailed to
// them. It is shown on the business page only after they confirm AND an admin approves it. `website` is a hidden trap field for bots.
import { sendEmail } from "../../_lib/email";
import { checkRecommendation, hashToken, newToken, renderConfirmEmail } from "../../_lib/recommend";
import { db, json, siteOrigin, type Env } from "../../_lib/stripe";

// Same reply whether or not this email already recommended this business, so the form cannot be used to look up who did.
const SENT = { ok: true, message: "Check your email and open the link to confirm. We read every recommendation before it is shown." };

const PER_EMAIL_PER_DAY = 3;
const UNCONFIRMED_PER_LISTING_PER_HOUR = 10;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL) {
    return json({ error: "Recommendations are not switched on yet." }, 501);
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof raw.website === "string" && raw.website.trim() !== "") return json(SENT); // a bot filled the hidden field

  const checked = checkRecommendation(raw);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const r = checked.value;

  const found = await db(env, `listings?slug=eq.${encodeURIComponent(r.slug)}&status=eq.published&select=id,business_name&limit=1`);
  if (!found.ok) return json({ error: "Could not save your recommendation. Please try again." }, 502);
  const listing = ((await found.json()) as { id: string; business_name: string }[])[0];
  if (!listing) return json({ error: "That business could not be found." }, 404);

  // Limits, so the form cannot be used to send many emails to one person or to flood one business.
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const hour = new Date(Date.now() - 3600_000).toISOString();
  const [byEmail, byListing] = await Promise.all([
    db(env, `listing_recommendations?author_email=eq.${encodeURIComponent(r.email)}&created_at=gt.${encodeURIComponent(day)}&select=id&limit=${PER_EMAIL_PER_DAY + 1}`),
    db(env, `listing_recommendations?listing_id=eq.${listing.id}&email_confirmed_at=is.null&created_at=gt.${encodeURIComponent(hour)}&select=id&limit=${UNCONFIRMED_PER_LISTING_PER_HOUR + 1}`),
  ]);
  if (!byEmail.ok || !byListing.ok) return json({ error: "Could not save your recommendation. Please try again." }, 502);
  if (((await byEmail.json()) as unknown[]).length >= PER_EMAIL_PER_DAY || ((await byListing.json()) as unknown[]).length >= UNCONFIRMED_PER_LISTING_PER_HOUR) {
    return json({ error: "Too many recommendations right now. Please try again later." }, 429);
  }

  const token = newToken();
  const tokenHash = await hashToken(token);
  const insert = await db(env, "listing_recommendations", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ listing_id: listing.id, author_name: r.shownName, author_email: r.email, body: r.body, token_hash: tokenHash }),
  });
  if (insert.status === 409) return json(SENT); // this email already recommended this business
  if (!insert.ok) return json({ error: "Could not save your recommendation. Please try again." }, 502);

  const link = `${siteOrigin(env, request)}/api/recommend/confirm?t=${token}`;
  try {
    await sendEmail(env, { to: r.email, ...renderConfirmEmail(listing.business_name, link) });
  } catch {
    // Remove the row so the customer can try again.
    await db(env, `listing_recommendations?token_hash=eq.${tokenHash}`, { method: "DELETE" });
    return json({ error: "We could not send the confirmation email. Please try again." }, 502);
  }
  return json(SENT);
};
