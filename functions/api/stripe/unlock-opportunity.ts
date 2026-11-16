// POST /api/stripe/unlock-opportunity  { kind: "permit" | "bid", itemId }  (Authorization: Bearer <Supabase access token>)
// Starts a one-time Stripe Checkout payment to see the phone number and email address on one building permit or government bid, and
// returns { url }. The lead must be in the contractor's area (the same rule that decides what they see). The price is decided here,
// never by the browser: $5 for a contractor on the paid plan, $10 otherwise (the same as a customer request).
// It is unlocked by the Stripe webhook, or by /api/stripe/confirm when the contractor comes back, after the payment succeeds.
import { isPaidNow } from "../../_lib/google";
import { notConfigured, LEAD_PRICE_CENTS, billingFor, db, getUser, json, ownedListingId, siteOrigin, stripe, type Env } from "../../_lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const notReady = notConfigured(env);
  if (notReady) return notReady;

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; itemId?: unknown };
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
    db(env, `listings?id=eq.${encodeURIComponent(listingId)}&select=plan,plan_until&limit=1`),
    db(env, `${table}?id=eq.${itemId}&select=${kind === "permit" ? "summary" : "title"}&limit=1`),
  ]);
  const reaches = reachRes.ok && (await reachRes.json()) === true;
  const already = unlockedRes.ok && ((await unlockedRes.json()) as unknown[]).length > 0;
  const listing = listingRes.ok ? ((await listingRes.json()) as { plan: string | null; plan_until: string | null }[])[0] : undefined;
  const item = itemRes.ok ? ((await itemRes.json()) as { summary?: string; title?: string }[])[0] : undefined;
  if (!reaches || !listing || !item) return json({ error: "That lead was not sent to you" }, 404);
  if (already) return json({ error: "Already unlocked" }, 409);

  const cents = isPaidNow(listing) ? LEAD_PRICE_CENTS.paid : LEAD_PRICE_CENTS.free;
  const origin = siteOrigin(env, request);
  const label = (item.summary ?? item.title ?? "").replace(/\s+/g, " ").slice(0, 110);
  const meta = { kind: `${kind}_unlock`, item_id: body.itemId, listing_id: listingId };
  const tab = kind === "permit" ? "&tab=permits" : "";

  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": `${kind === "permit" ? "Building permit" : "Government bid"}: ${label}`,
    success_url: `${origin}/contractor/opportunities?unlocked=1&session_id={CHECKOUT_SESSION_ID}&open=${body.itemId}${tab}`,
    cancel_url: `${origin}/contractor/opportunities${kind === "permit" ? "?tab=permits" : ""}`,
    client_reference_id: listingId,
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][description]": `Unlock the contact details on a ${kind === "permit" ? "building permit" : "government bid"}`,
    ...Object.fromEntries(Object.entries(meta).flatMap(([k, v]) => [[`metadata[${k}]`, v], [`payment_intent_data[metadata][${k}]`, v]])),
  };
  const billing = await billingFor(env, listingId);
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
