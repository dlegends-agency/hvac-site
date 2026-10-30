// POST /api/stripe/webhook : Stripe calls this when a subscription starts, changes or ends.
// It is the only thing that turns payments into a plan on a listing, so a browser can never grant itself a plan.
import { db, entitlement, json, stripe, verifyStripeSignature, type Env, type StripeSubscription } from "../../_lib/stripe";

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

async function apply(env: Env, sub: StripeSubscription, listingId: string | undefined): Promise<void> {
  const id = listingId ?? sub.metadata?.listing_id;
  if (!id) return; // not one of our subscriptions
  const { plan, until } = entitlement(env, sub);

  const billing = await db(env, "listing_billing?on_conflict=listing_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      listing_id: id, stripe_customer_id: sub.customer, stripe_subscription_id: sub.id, plan, status: sub.status,
      current_period_end: until, updated_at: new Date().toISOString(),
    }),
  });
  const listing = await db(env, `listings?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ plan, plan_until: until }),
  });
  if (!billing.ok || !listing.ok) throw new Error("Database update failed");
}

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Not configured" }, 501);

  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(payload) as StripeEvent;
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { subscription?: string; client_reference_id?: string };
      if (session.subscription) {
        const sub = await stripe<StripeSubscription>(env, "GET", `/subscriptions/${session.subscription}`);
        await apply(env, sub, session.client_reference_id);
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      await apply(env, event.data.object as unknown as StripeSubscription, undefined);
    }
  } catch {
    return json({ error: "Processing failed" }, 500); // Stripe retries on a non-2xx response
  }
  return json({ received: true });
};
