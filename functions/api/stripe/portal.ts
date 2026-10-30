// POST /api/stripe/portal  (Authorization: Bearer <Supabase access token>)
// Opens Stripe's hosted billing portal (update card, change plan, cancel, invoices) and returns { url }.
import { billingFor, getUser, json, ownedListingId, siteOrigin, stripe, type Env } from "../../_lib/stripe";

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Payments are not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);
  const billing = await billingFor(env, listingId);
  if (!billing?.stripe_customer_id) return json({ error: "No subscription yet" }, 404);

  try {
    const session = await stripe<{ url: string }>(env, "POST", "/billing_portal/sessions", {
      customer: billing.stripe_customer_id,
      return_url: `${siteOrigin(env, request)}/contractor/billing`,
    });
    return json({ url: session.url });
  } catch {
    return json({ error: "Could not open the billing portal" }, 502);
  }
};
