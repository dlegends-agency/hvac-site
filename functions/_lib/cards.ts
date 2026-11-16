// Saved cards for a contractor's Stripe customer. The full card number never reaches this site: Stripe only returns the brand, the last
// four digits and the expiry, and cards are typed in on Stripe's own page (Checkout in "setup" mode).
import { db, stripe, type Env } from "./stripe";

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  isDefault: boolean;
}

interface StripePm {
  id: string;
  customer?: string | null;
  card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
}

export const cardOf = (pm: StripePm, defaultId: string | null): SavedCard => ({
  id: pm.id,
  brand: pm.card?.brand ?? "card",
  last4: pm.card?.last4 ?? "????",
  exp_month: pm.card?.exp_month ?? 0,
  exp_year: pm.card?.exp_year ?? 0,
  isDefault: pm.id === defaultId,
});

/** The customer's default payment method id (the one used for renewals and one-click payments), or null. */
export async function defaultCardId(env: Env, customer: string): Promise<string | null> {
  const c = await stripe<{ invoice_settings?: { default_payment_method?: string | { id: string } | null } }>(env, "GET", `/customers/${encodeURIComponent(customer)}`);
  const d = c.invoice_settings?.default_payment_method;
  return typeof d === "string" ? d : d?.id ?? null;
}

/** Every card on file. If none is the default yet (for example the first card just added), the first one becomes the default. */
export async function listCards(env: Env, customer: string): Promise<SavedCard[]> {
  const [list, current] = await Promise.all([
    stripe<{ data: StripePm[] }>(env, "GET", "/payment_methods", { customer, type: "card", limit: "20" }),
    defaultCardId(env, customer),
  ]);
  let defaultId = current && list.data.some((p) => p.id === current) ? current : null;
  if (!defaultId && list.data.length > 0) {
    defaultId = list.data[0].id;
    await setDefaultCard(env, customer, defaultId, null).catch(() => undefined);
  }
  return list.data.map((p) => cardOf(p, defaultId));
}

/** True when this payment method belongs to this customer (so nobody can touch another business's card). */
export async function cardBelongsTo(env: Env, customer: string, pmId: string): Promise<boolean> {
  if (!/^pm_[A-Za-z0-9_]+$/.test(pmId)) return false;
  const pm = await stripe<StripePm>(env, "GET", `/payment_methods/${pmId}`).catch(() => null);
  return pm?.customer === customer;
}

export async function setDefaultCard(env: Env, customer: string, pmId: string, subscriptionId: string | null): Promise<void> {
  await stripe(env, "POST", `/customers/${encodeURIComponent(customer)}`, { "invoice_settings[default_payment_method]": pmId });
  // Renewals of the plan use the subscription's own card when it has one, so keep that in step.
  if (subscriptionId) await stripe(env, "POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { default_payment_method: pmId }).catch(() => undefined);
}

export async function removeCard(env: Env, pmId: string): Promise<void> {
  await stripe(env, "POST", `/payment_methods/${pmId}/detach`, {});
}

/** The Stripe customer of this business, created (and remembered) on first use. */
export async function ensureCustomer(env: Env, listingId: string, existing: string | null | undefined, email: string): Promise<string> {
  if (existing) return existing;
  const created = await stripe<{ id: string }>(env, "POST", "/customers", { ...(email ? { email } : {}), "metadata[listing_id]": listingId });
  const saved = await db(env, "listing_billing?on_conflict=listing_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ listing_id: listingId, stripe_customer_id: created.id }),
  });
  if (!saved.ok) throw new Error("Could not save the customer");
  return created.id;
}

/**
 * One-click payment with the default card: creates an invoice for this one charge (so it shows in payment history with a receipt), and
 * pays it right away with the saved card. If the card is declined or needs the customer to confirm, nothing is kept (the invoice is voided)
 * and the caller falls back to the normal Stripe Checkout page.
 */
export async function payWithSavedCard(
  env: Env,
  a: { customer: string; paymentMethod: string; cents: number; description: string; metadata: Record<string, string> },
): Promise<{ ok: true; ref: string } | { ok: false; reason: string }> {
  let invoiceId: string | null = null;
  try {
    const meta = Object.fromEntries(Object.entries(a.metadata).map(([k, v]) => [`metadata[${k}]`, v]));
    const invoice = await stripe<{ id: string }>(env, "POST", "/invoices", {
      customer: a.customer,
      auto_advance: "false",
      collection_method: "charge_automatically",
      default_payment_method: a.paymentMethod,
      pending_invoice_items_behavior: "exclude", // never sweep in anything else waiting for the next invoice
      description: a.description,
      ...meta,
    });
    invoiceId = invoice.id;
    await stripe(env, "POST", "/invoiceitems", { customer: a.customer, invoice: invoice.id, amount: String(a.cents), currency: "usd", description: a.description });
    await stripe(env, "POST", `/invoices/${invoice.id}/finalize`, { auto_advance: "false" });
    const paid = await stripe<{ status?: string }>(env, "POST", `/invoices/${invoice.id}/pay`, { payment_method: a.paymentMethod, off_session: "true" });
    if (paid.status !== "paid") throw new Error("Payment not completed");
    return { ok: true, ref: invoice.id };
  } catch (e) {
    if (invoiceId) await stripe(env, "POST", `/invoices/${invoiceId}/void`, {}).catch(() => undefined);
    return { ok: false, reason: e instanceof Error ? e.message : "Payment failed" };
  }
}
