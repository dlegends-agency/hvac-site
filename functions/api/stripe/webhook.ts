// POST /api/stripe/webhook : Stripe calls this when a subscription starts, changes or ends, and when a lead payment succeeds.
// It is the only thing that turns payments into a plan or an unlocked lead, so a browser can never grant itself either.
import { db, entitlement, json, stripe, verifyStripeSignature, type Env, type StripeSubscription } from "../../_lib/stripe";

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

interface CheckoutSession {
  id: string;
  mode?: string;
  payment_status?: string;
  subscription?: string;
  customer?: string | null;
  amount_total?: number | null;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

async function apply(env: Env, sub: StripeSubscription, listingId: string | undefined): Promise<void> {
  const id = listingId ?? sub.metadata?.listing_id;
  if (!id) return; // not one of our subscriptions
  const { plan, until, interval } = entitlement(env, sub);

  const billing = await db(env, "listing_billing?on_conflict=listing_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      listing_id: id, stripe_customer_id: sub.customer, stripe_subscription_id: sub.id, plan, status: sub.status,
      current_period_end: until, billing_interval: interval, updated_at: new Date().toISOString(),
    }),
  });
  const listing = await db(env, `listings?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ plan, plan_until: until }),
  });
  if (!billing.ok || !listing.ok) throw new Error("Database update failed");
}

/** A paid-for lead: unlock it for the contractor who paid, and remember their Stripe customer for payment history. */
async function unlockLead(env: Env, session: CheckoutSession): Promise<void> {
  const leadId = session.metadata?.lead_id;
  const listingId = session.metadata?.listing_id;
  if (session.metadata?.kind !== "lead_unlock" || !leadId || !listingId || session.payment_status !== "paid") return;

  if (session.customer) {
    // Only the customer id is written, so an existing subscription record keeps its other columns.
    const keep = await db(env, "listing_billing?on_conflict=listing_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ listing_id: listingId, stripe_customer_id: session.customer }),
    });
    if (!keep.ok) throw new Error("Could not save the customer");
  }
  const res = await db(env, "rpc/unlock_lead", {
    method: "POST",
    body: JSON.stringify({ p_lead: leadId, p_listing: listingId, p_cents: session.amount_total ?? 0, p_ref: session.id }),
  });
  if (!res.ok) throw new Error("Could not unlock the lead");
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
      if (session.mode === "payment") {
        await unlockLead(env, session);
      } else if (session.subscription) {
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
