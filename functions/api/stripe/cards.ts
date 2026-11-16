// POST /api/stripe/cards  { action, paymentMethodId? }  (Authorization: Bearer <Supabase access token>)
// Manages the signed-in contractor's saved cards. Actions:
//   list     -> { cards: [{ id, brand, last4, exp_month, exp_year, isDefault }] }
//   add      -> { url }  Stripe's own page where the card is typed in (Checkout in setup mode); the card never touches this site
//   default  -> makes that card the one used for plan renewals and one-click payments
//   remove   -> deletes that card (the last card cannot be removed while a plan is active)
// A card id is only accepted when it belongs to this business's own Stripe customer.
import { cardBelongsTo, ensureCustomer, listCards, removeCard, setDefaultCard } from "../../_lib/cards";
import { notConfigured, billingFor, getUser, json, ownedListingId, siteOrigin, stripe, type Env } from "../../_lib/stripe";

const ACTIVE = new Set(["active", "trialing", "past_due"]);

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const notReady = notConfigured(env);
  if (notReady) return notReady;

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; paymentMethodId?: unknown };
  const billing = await billingFor(env, listingId);
  const customer = billing?.stripe_customer_id ?? null;

  try {
    if (body.action === "list") {
      return json({ cards: customer ? await listCards(env, customer) : [] });
    }

    if (body.action === "add") {
      const id = await ensureCustomer(env, listingId, customer, user.email);
      const origin = siteOrigin(env, request);
      const session = await stripe<{ url: string }>(env, "POST", "/checkout/sessions", {
        mode: "setup",
        customer: id,
        "payment_method_types[0]": "card",
        success_url: `${origin}/contractor/account?card=added`,
        cancel_url: `${origin}/contractor/account`,
        client_reference_id: listingId,
      });
      return json({ url: session.url });
    }

    const pm = typeof body.paymentMethodId === "string" ? body.paymentMethodId : "";
    if (body.action === "default" || body.action === "remove") {
      if (!customer || !(await cardBelongsTo(env, customer, pm))) return json({ error: "That card was not found" }, 404);

      if (body.action === "default") {
        await setDefaultCard(env, customer, pm, billing?.stripe_subscription_id ?? null);
        return json({ cards: await listCards(env, customer) });
      }

      const before = await listCards(env, customer);
      const planActive = Boolean(billing?.stripe_subscription_id && billing.status && ACTIVE.has(billing.status));
      if (planActive && before.length <= 1) return json({ error: "Add another card before removing this one, because your plan renews with it." }, 409);
      await removeCard(env, pm);
      const after = await listCards(env, customer); // makes another card the default if the removed one was
      if (planActive && billing?.stripe_subscription_id) {
        const next = after.find((c) => c.isDefault);
        if (next) await setDefaultCard(env, customer, next.id, billing.stripe_subscription_id);
      }
      return json({ cards: after });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: "Could not update your cards", detail: e instanceof Error ? e.message : undefined }, 502);
  }
};
