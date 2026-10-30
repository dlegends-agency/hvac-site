// POST /api/stripe/account  (Authorization: Bearer <Supabase access token>)
// The signed-in contractor's card on file (brand, last 4, expiry only) and payment history, read from Stripe.
// Full card numbers never reach this site: Stripe only ever returns the brand, last four digits and expiry.
import { billingFor, getUser, json, ownedListingId, planForPrice, stripe, type Env } from "../../_lib/stripe";

interface StripeCard {
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
}
interface StripePaymentMethod {
  id: string;
  card?: StripeCard;
}
interface StripeInvoice {
  id: string;
  number: string | null;
  created: number;
  total: number;
  amount_paid: number;
  currency: string;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  lines?: { data: { price?: { id: string } | null }[] };
}
interface StripeSubscription {
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  default_payment_method?: StripePaymentMethod | string | null;
  items?: { data: { price?: { id: string }; current_period_end?: number }[] };
}

const asCard = (pm: unknown) => {
  const c = (pm as StripePaymentMethod | null | undefined)?.card;
  return c?.last4 ? { brand: c.brand ?? "card", last4: c.last4, exp_month: c.exp_month ?? 0, exp_year: c.exp_year ?? 0 } : null;
};

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Payments are not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const billing = await billingFor(env, listingId);
  const customer = billing?.stripe_customer_id;
  if (!customer) return json({ card: null, invoices: [], subscription: null });

  try {
    const [invoiceList, subscriptionRaw] = await Promise.all([
      stripe<{ data: StripeInvoice[] }>(env, "GET", "/invoices", { customer, limit: "24" }),
      billing?.stripe_subscription_id
        ? stripe<StripeSubscription>(env, "GET", `/subscriptions/${encodeURIComponent(billing.stripe_subscription_id)}`, { "expand[0]": "default_payment_method" }).catch(() => null)
        : Promise.resolve(null),
    ]);

    // Card: the subscription's own card, else the customer's default, else any card on file.
    let card = asCard(subscriptionRaw?.default_payment_method);
    if (!card) {
      const customerRow = await stripe<{ invoice_settings?: { default_payment_method?: StripePaymentMethod | null } }>(env, "GET", `/customers/${encodeURIComponent(customer)}`, {
        "expand[0]": "invoice_settings.default_payment_method",
      }).catch(() => null);
      card = asCard(customerRow?.invoice_settings?.default_payment_method);
    }
    if (!card) {
      const list = await stripe<{ data: StripePaymentMethod[] }>(env, "GET", "/payment_methods", { customer, type: "card", limit: "1" }).catch(() => null);
      card = asCard(list?.data[0]);
    }

    const item = subscriptionRaw?.items?.data[0];
    const end = subscriptionRaw?.current_period_end ?? item?.current_period_end;
    return json({
      card,
      subscription: subscriptionRaw
        ? { status: subscriptionRaw.status, cancel_at_period_end: Boolean(subscriptionRaw.cancel_at_period_end), current_period_end: end ? new Date(end * 1000).toISOString() : null, plan: planForPrice(env, item?.price?.id) }
        : null,
      invoices: invoiceList.data
        .filter((i) => i.status && i.status !== "draft")
        .map((i) => ({
          id: i.id,
          number: i.number,
          date: new Date(i.created * 1000).toISOString(),
          amount: i.status === "paid" ? i.amount_paid : i.total,
          currency: i.currency,
          status: i.status,
          plan: planForPrice(env, i.lines?.data[0]?.price?.id),
          url: i.hosted_invoice_url,
          pdf: i.invoice_pdf,
        })),
    });
  } catch {
    return json({ error: "Could not load payment details" }, 502);
  }
};
