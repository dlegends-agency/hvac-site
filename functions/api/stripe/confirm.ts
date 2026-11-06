// POST /api/stripe/confirm  { sessionId }  (Authorization: Bearer <Supabase access token>)
// Runs when a contractor comes back from Stripe Checkout. It asks Stripe whether that session was really paid, then grants what was
// bought (the plan or the unlocked request), exactly as the webhook does. The browser never decides: the answer comes from Stripe,
// and the session must belong to the signed-in contractor's own listing. Safe to call more than once.
import { fulfilSession, type CheckoutSession } from "../../_lib/fulfil";
import { getUser, json, notConfigured, ownedListingId, stripe, type Env } from "../../_lib/stripe";

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const notReady = notConfigured(env);
  if (notReady) return notReady;

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
  if (typeof body.sessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(body.sessionId)) return json({ error: "Unknown payment" }, 400);

  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  let session: CheckoutSession;
  try {
    session = await stripe<CheckoutSession>(env, "GET", `/checkout/sessions/${body.sessionId}`);
  } catch (e) {
    return json({ error: "Could not check the payment", detail: e instanceof Error ? e.message : undefined }, 502);
  }
  // Only this contractor's own purchase counts.
  const owner = session.metadata?.listing_id ?? session.client_reference_id;
  if (owner !== listingId) return json({ error: "That payment is not yours" }, 403);
  if (session.payment_status !== "paid") return json({ paid: false });

  try {
    await fulfilSession(env, session);
  } catch {
    return json({ error: "Could not apply the payment" }, 500);
  }
  return json({ paid: true });
};
