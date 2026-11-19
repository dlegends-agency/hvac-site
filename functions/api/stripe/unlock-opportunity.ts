// POST /api/stripe/unlock-opportunity  { kind: "permit" | "bid", itemId }  (Authorization: Bearer <Supabase access token>)
// Starts a one-time Stripe Checkout payment to see the phone number and email address on one building permit or government bid, and
// returns { url }. The lead must be in the contractor's area (the same rule that decides what they see). The price is decided here,
// never by the browser: a permit is $5 on Featured and $10 on Free; a government bid is $50 on Featured and $100 on Free. Premium has everything unlocked and never pays.
// It is unlocked by the Stripe webhook, or by /api/stripe/confirm when the contractor comes back, after the payment succeeds.
import { defaultCardId, payWithSavedCard } from "../../_lib/cards";
import { unlockOpportunity } from "../../_lib/fulfil";
import { isPaidNow } from "../../_lib/google";
import { notConfigured, UNLOCK_CENTS, billingFor, db, getUser, json, ownedListingId, siteOrigin, stripe, type Env } from "../../_lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const notReady = notConfigured(env);
  if (notReady) return notReady;

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; itemId?: unknown; useSavedCard?: unknown };
  if (body.kind !== "permit" && body.kind !== "bid") return json({ error: "Unknown lead type" }, 400);
  if (typeof body.itemId !== "string" || !UUID.test(body.itemId)) return json({ error: "Unknown lead" }, 400);

  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const kind = body.kind;
  const itemId = encodeURIComponent(body.itemId);
  const table = kind === "permit" ? "public_permits" : "gov_bids";
  const [reachRes, unlockedRes, listingRes, itemRes] = await Promise.all([
    db(env, "rpc/opportunity_reaches", { method: "POST", body: JSON.stringify({ p_kind: kind, p_item: body.itemId, p_listing: listingId }) }),
    db(env, `opportunity_unlocks?listing_id=eq.${encodeURIComponent(listingId)}&kind=eq.${kind}&item_id=eq.${itemId}&select=item_id&limit=1`),
    db(env, `listings?id=eq.${encodeURIComponent(listingId)}&select=plan,plan_until,premium&limit=1`),
    db(env, `${table}?id=eq.${itemId}&select=${kind === "permit" ? "summary" : "title"}&limit=1`),
  ]);
  const reaches = reachRes.ok && (await reachRes.json()) === true;
  const already = unlockedRes.ok && ((await unlockedRes.json()) as unknown[]).length > 0;
  const listing = listingRes.ok ? ((await listingRes.json()) as { plan: string | null; plan_until: string | null; premium: boolean | null }[])[0] : undefined;
  const item = itemRes.ok ? ((await itemRes.json()) as { summary?: string; title?: string }[])[0] : undefined;
  if (!reaches || !listing || !item) return json({ error: "That lead was not sent to you" }, 404);
  if (already) return json({ error: "Already unlocked" }, 409);

  if (isPaidNow(listing) && listing.premium) return json({ error: "Already unlocked: Premium includes every lead" }, 409);
  const cents = isPaidNow(listing) ? UNLOCK_CENTS[kind].paid : UNLOCK_CENTS[kind].free;
  const origin = siteOrigin(env, request);
  const label = (item.summary ?? item.title ?? "").replace(/\s+/g, " ").slice(0, 110);
  const meta = { kind: `${kind}_unlock`, item_id: body.itemId, listing_id: listingId };

  // One click with the default saved card. If it is declined or needs confirming, the browser falls back to the Stripe Checkout page.
  const billing = await billingFor(env, listingId);
  if (body.useSavedCard === true && billing?.stripe_customer_id) {
    const pm = await defaultCardId(env, billing.stripe_customer_id).catch(() => null);
    if (pm) {
      const paid = await payWithSavedCard(env, { customer: billing.stripe_customer_id, paymentMethod: pm, cents, description: `${kind === "permit" ? "Building permit" : "Government bid"}: ${label}`, metadata: meta });
      if (!paid.ok) return json({ error: "card_declined", detail: paid.reason }, 402);
      await unlockOpportunity(env, { id: paid.ref, mode: "payment", payment_status: "paid", amount_total: cents, metadata: meta });
      return json({ unlocked: true, cents });
    }
  }

  const params: Record<string, string> = {
    mode: "payment",
    "payment_intent_data[setup_future_usage]": "off_session", // keeps the card on file for next time (shown under Account settings)
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": `${kind === "permit" ? "Building permit" : "Government bid"}: ${label}`,
    success_url: `${origin}/contractor/leads?unlocked=1&session_id={CHECKOUT_SESSION_ID}&open=${kind}:${body.itemId}`,
    cancel_url: `${origin}/contractor/leads`,
    client_reference_id: listingId,
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][description]": `Unlock the contact details on a ${kind === "permit" ? "building permit" : "government bid"}`,
    ...Object.fromEntries(Object.entries(meta).flatMap(([k, v]) => [[`metadata[${k}]`, v], [`payment_intent_data[metadata][${k}]`, v]])),
  };
  if (billing?.stripe_customer_id) params.customer = billing.stripe_customer_id;
  else {
    params.customer_creation = "always";
    if (user.email) params.customer_email = user.email;
  }

  try {
    const session = await stripe<{ url: string }>(env, "POST", "/checkout/sessions", params);
    return json({ url: session.url, cents });
  } catch (e) {
    return json({ error: "Could not start checkout", detail: e instanceof Error ? e.message : undefined }, 502);
  }
};
