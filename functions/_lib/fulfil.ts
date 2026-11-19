// Turns a paid Stripe Checkout session into what was bought: a plan or an unlocked lead.
// Used by the Stripe webhook and by /api/stripe/confirm (which runs when the contractor comes back from Stripe), so a missed or late
// webhook never leaves a paid request locked. Both are safe to run more than once for the same payment.
import { db, entitlement, stripe, type Env, type StripeSubscription } from "./stripe";

export interface CheckoutSession {
  id: string;
  mode?: string;
  payment_status?: string;
  subscription?: string;
  customer?: string | null;
  amount_total?: number | null;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

export async function applySubscription(env: Env, sub: StripeSubscription, listingId: string | undefined): Promise<void> {
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
  // Premium is a Featured listing with the premium flag on, so every "paid" check keeps working.
  const patch = (body: Record<string, unknown>) => db(env, `listings?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
  const base = { plan: plan === "free" ? "free" : "featured", plan_until: until };
  let listing = await patch({ ...base, premium: plan === "premium" });
  // Before supabase/schema-revamp.sql has been run there is no premium column: still apply the plan, so a Featured payment is never lost.
  if (!listing.ok && plan !== "premium") listing = await patch(base);
  if (!billing.ok || !listing.ok) throw new Error("Database update failed");
}

/** A paid-for lead: unlock it for the contractor who paid, and remember their Stripe customer for payment history. */
export async function unlockLead(env: Env, session: CheckoutSession): Promise<void> {
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

/** A paid-for building permit or government bid: unlock its phone and email for the business that paid. */
export async function unlockOpportunity(env: Env, session: CheckoutSession): Promise<void> {
  const kind = session.metadata?.kind === "permit_unlock" ? "permit" : session.metadata?.kind === "bid_unlock" ? "bid" : null;
  const itemId = session.metadata?.item_id;
  const listingId = session.metadata?.listing_id;
  if (!kind || !itemId || !listingId || session.payment_status !== "paid") return;

  if (session.customer) {
    const keep = await db(env, "listing_billing?on_conflict=listing_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ listing_id: listingId, stripe_customer_id: session.customer }),
    });
    if (!keep.ok) throw new Error("Could not save the customer");
  }
  const res = await db(env, "rpc/unlock_opportunity", {
    method: "POST",
    body: JSON.stringify({ p_kind: kind, p_item: itemId, p_listing: listingId, p_cents: session.amount_total ?? 0, p_ref: session.id }),
  });
  if (!res.ok) throw new Error("Could not unlock the lead");
}

/** Fulfils a completed Checkout session of either kind. */
export async function fulfilSession(env: Env, session: CheckoutSession): Promise<void> {
  if (session.mode === "payment") {
    if (session.metadata?.kind === "permit_unlock" || session.metadata?.kind === "bid_unlock") await unlockOpportunity(env, session);
    else await unlockLead(env, session);
  } else if (session.subscription) {
    const sub = await stripe<StripeSubscription>(env, "GET", `/subscriptions/${session.subscription}`);
    await applySubscription(env, sub, session.client_reference_id);
  }
}
