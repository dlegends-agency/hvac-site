// POST /api/stripe/webhook : Stripe calls this when a subscription starts, changes or ends, and when a lead payment succeeds.
// It is the only thing that turns payments into a plan or an unlocked lead, so a browser can never grant itself either.
import { applySubscription, fulfilSession, type CheckoutSession } from "../../_lib/fulfil";
import { json, verifyStripeSignature, type Env, type StripeSubscription } from "../../_lib/stripe";

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Not configured" }, 501);

  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(payload) as StripeEvent;
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as unknown as CheckoutSession;
      await fulfilSession(env, session);
    } else if (event.type.startsWith("customer.subscription.")) {
      await applySubscription(env, event.data.object as unknown as StripeSubscription, undefined);
    }
  } catch {
    return json({ error: "Processing failed" }, 500); // Stripe retries on a non-2xx response
  }
  return json({ received: true });
};
