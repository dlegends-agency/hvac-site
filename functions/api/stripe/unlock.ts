// POST /api/stripe/unlock  { leadId }  (Authorization: Bearer <Supabase access token>)
// Starts a one-time Stripe Checkout payment to see one customer's full details, and returns { url }.
// The price is decided here, never by the browser: $5 for a contractor on the Featured plan, $10 on Free. Premium has everything unlocked and never pays.
// The lead is unlocked by the Stripe webhook after the payment succeeds.
import { defaultCardId, payWithSavedCard } from "../../_lib/cards";
import { unlockLead } from "../../_lib/fulfil";
import { isPaidNow } from "../../_lib/google";
import { notConfigured, UNLOCK_CENTS, billingFor, db, getUser, json, ownedListingId, siteOrigin, stripe, type Env } from "../../_lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const notReady = notConfigured(env);
  if (notReady) return notReady;

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const body = (await request.json().catch(() => ({}))) as { leadId?: unknown; useSavedCard?: unknown };
  if (typeof body.leadId !== "string" || !UUID.test(body.leadId)) return json({ error: "Unknown request" }, 400);

  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const leadId = encodeURIComponent(body.leadId);
  const [assignmentRes, listingRes, leadRes] = await Promise.all([
    db(env, `lead_assignments?lead_id=eq.${leadId}&listing_id=eq.${encodeURIComponent(listingId)}&select=unlocked_at&limit=1`),
    db(env, `listings?id=eq.${encodeURIComponent(listingId)}&select=plan,plan_until,premium&limit=1`),
    db(env, `leads?id=eq.${leadId}&select=issue&limit=1`),
  ]);
  const assignment = assignmentRes.ok ? ((await assignmentRes.json()) as { unlocked_at: string | null }[])[0] : undefined;
  const listing = listingRes.ok ? ((await listingRes.json()) as { plan: string | null; plan_until: string | null; premium: boolean | null }[])[0] : undefined;
  const lead = leadRes.ok ? ((await leadRes.json()) as { issue: string }[])[0] : undefined;
  if (!assignment || !listing || !lead) return json({ error: "That request was not sent to you" }, 404);
  if (assignment.unlocked_at) return json({ error: "Already unlocked" }, 409);

  if (isPaidNow(listing) && listing.premium) return json({ error: "Already unlocked: Premium includes every request" }, 409);
  const cents = isPaidNow(listing) ? UNLOCK_CENTS.lead.paid : UNLOCK_CENTS.lead.free;
  const origin = siteOrigin(env, request);
  const name = `Customer request: ${lead.issue.replace(/\s+/g, " ").slice(0, 120)}`;
  const meta = { kind: "lead_unlock", lead_id: body.leadId, listing_id: listingId };

  // One click with the default saved card. If it is declined or needs confirming, the browser falls back to the Stripe Checkout page.
  const billing = await billingFor(env, listingId);
  if (body.useSavedCard === true && billing?.stripe_customer_id) {
    const pm = await defaultCardId(env, billing.stripe_customer_id).catch(() => null);
    if (pm) {
      const paid = await payWithSavedCard(env, { customer: billing.stripe_customer_id, paymentMethod: pm, cents, description: name, metadata: meta });
      if (!paid.ok) return json({ error: "card_declined", detail: paid.reason }, 402);
      await unlockLead(env, { id: paid.ref, mode: "payment", payment_status: "paid", amount_total: cents, metadata: meta });
      return json({ unlocked: true, cents });
    }
  }

  const params: Record<string, string> = {
    mode: "payment",
    "payment_intent_data[setup_future_usage]": "off_session", // keeps the card on file for next time (shown under Account settings)
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": name,
    success_url: `${origin}/contractor/leads?unlocked=1&open=lead:${body.leadId}&lead=${body.leadId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/contractor/leads`,
    client_reference_id: listingId,
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][description]": "Unlock a customer request's full details",
    ...Object.fromEntries(Object.entries(meta).flatMap(([k, v]) => [[`metadata[${k}]`, v], [`payment_intent_data[metadata][${k}]`, v]])),
  };
  if (billing?.stripe_customer_id) params.customer = billing.stripe_customer_id;
  else {
    params.customer_creation = "always"; // so the payment appears in their history and the card can be reused
    if (user.email) params.customer_email = user.email;
  }

  try {
    const session = await stripe<{ url: string }>(env, "POST", "/checkout/sessions", params);
    return json({ url: session.url, cents });
  } catch (e) {
    return json({ error: "Could not start checkout", detail: e instanceof Error ? e.message : undefined }, 502);
  }
};
