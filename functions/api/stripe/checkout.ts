// POST /api/stripe/checkout  { plan: "featured", interval: "month" | "year" }  (Authorization: Bearer <Supabase access token>)
// Starts a Stripe Checkout subscription for the signed-in contractor's listing and returns { url }.
import { billingFor, getUser, isInterval, isPlan, json, ownedListingId, priceFor, siteOrigin, stripe, type Env } from "../../_lib/stripe";

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Payments are not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown; interval?: unknown };
  const plan = body.plan ?? "featured";
  const interval = body.interval ?? "month";
  if (!isPlan(plan) || !isInterval(interval)) return json({ error: "Unknown plan" }, 400);
  const price = priceFor(env, plan, interval);
  if (!price) return json({ error: "Payments are not configured" }, 501);

  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const billing = await billingFor(env, listingId);
  if (billing?.status && ["active", "trialing", "past_due"].includes(billing.status)) {
    return json({ error: "Already subscribed. Use the billing portal to change or cancel your plan." }, 409);
  }

  const origin = siteOrigin(env, request);
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/contractor/billing?status=success`,
    cancel_url: `${origin}/contractor/billing`,
    client_reference_id: listingId,
    "metadata[listing_id]": listingId,
    "metadata[plan]": plan,
    "subscription_data[metadata][listing_id]": listingId,
    "subscription_data[metadata][plan]": plan,
    allow_promotion_codes: "true",
  };
  if (billing?.stripe_customer_id) params.customer = billing.stripe_customer_id;
  else if (user.email) params.customer_email = user.email;

  try {
    const session = await stripe<{ url: string }>(env, "POST", "/checkout/sessions", params);
    return json({ url: session.url });
  } catch {
    return json({ error: "Could not start checkout" }, 502);
  }
};
