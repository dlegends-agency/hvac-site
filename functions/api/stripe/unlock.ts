// POST /api/stripe/unlock  { leadId }  (Authorization: Bearer <Supabase access token>)
// Starts a one-time Stripe Checkout payment to see one customer's full details, and returns { url }.
// The price is decided here, never by the browser: $5 for a contractor on the paid plan, $10 otherwise.
// The lead is unlocked by the Stripe webhook after the payment succeeds.
import { isPaidNow } from "../../_lib/google";
import { LEAD_PRICE_CENTS, billingFor, db, getUser, json, ownedListingId, siteOrigin, stripe, type Env } from "../../_lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Payments are not configured" }, 501);

  const user = await getUser(env, request);
  if (!user) return json({ error: "Sign in required" }, 401);
  const body = (await request.json().catch(() => ({}))) as { leadId?: unknown };
  if (typeof body.leadId !== "string" || !UUID.test(body.leadId)) return json({ error: "Unknown request" }, 400);

  const listingId = await ownedListingId(env, user.id);
  if (!listingId) return json({ error: "No approved listing on this account" }, 403);

  const leadId = encodeURIComponent(body.leadId);
  const [assignmentRes, listingRes, leadRes] = await Promise.all([
    db(env, `lead_assignments?lead_id=eq.${leadId}&listing_id=eq.${encodeURIComponent(listingId)}&select=unlocked_at&limit=1`),
    db(env, `listings?id=eq.${encodeURIComponent(listingId)}&select=plan,plan_until&limit=1`),
    db(env, `leads?id=eq.${leadId}&select=issue&limit=1`),
  ]);
  const assignment = assignmentRes.ok ? ((await assignmentRes.json()) as { unlocked_at: string | null }[])[0] : undefined;
  const listing = listingRes.ok ? ((await listingRes.json()) as { plan: string | null; plan_until: string | null }[])[0] : undefined;
  const lead = leadRes.ok ? ((await leadRes.json()) as { issue: string }[])[0] : undefined;
  if (!assignment || !listing || !lead) return json({ error: "That request was not sent to you" }, 404);
  if (assignment.unlocked_at) return json({ error: "Already unlocked" }, 409);

  const cents = isPaidNow(listing) ? LEAD_PRICE_CENTS.paid : LEAD_PRICE_CENTS.free;
  const origin = siteOrigin(env, request);
  const name = `Customer request: ${lead.issue.replace(/\s+/g, " ").slice(0, 120)}`;
  const meta = { kind: "lead_unlock", lead_id: body.leadId, listing_id: listingId };

  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": name,
    success_url: `${origin}/contractor/leads?unlocked=1&lead=${body.leadId}`,
    cancel_url: `${origin}/contractor/leads`,
    client_reference_id: listingId,
    "invoice_creation[enabled]": "true",
    "invoice_creation[invoice_data][description]": "Unlock a customer request's full details",
    ...Object.fromEntries(Object.entries(meta).flatMap(([k, v]) => [[`metadata[${k}]`, v], [`payment_intent_data[metadata][${k}]`, v]])),
  };
  const billing = await billingFor(env, listingId);
  if (billing?.stripe_customer_id) params.customer = billing.stripe_customer_id;
  else {
    params.customer_creation = "always"; // so the payment appears in their history and the card can be reused
    if (user.email) params.customer_email = user.email;
  }

  try {
    const session = await stripe<{ url: string }>(env, "POST", "/checkout/sessions", params);
    return json({ url: session.url, cents });
  } catch {
    return json({ error: "Could not start checkout" }, 502);
  }
};
