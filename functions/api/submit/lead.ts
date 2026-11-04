// POST /api/submit/lead   { captcha, idempotency_key, source, issue, ..., referral_acknowledgment }
// A customer's service request. Checks the CAPTCHA, keeps only the allowed fields and saves the lead with the service role key. If the
// customer is signed in (Authorization header), the lead is linked to their account so they can follow it under "My requests".
import { getUser, db, json, type Env } from "../../_lib/stripe";
import { pickFields, readGuarded, type Spec } from "../../_lib/submit";

export const LEAD_FIELDS: Spec = {
  idempotency_key: "t?", source: "t?", issue: "T", urgency: "t", country: "t", state: "t", city: "t", postal_code: "t", street: "t", unit: "t?",
  first_name: "t", last_name: "t", phone: "t", email: "t", contact_method: "t", description: "T?", property_type: "t", property_status: "t",
  preferred_contact_time: "t?", referral_acknowledgment: "b", marketing_consent: "b?",
};

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const guarded = await readGuarded(env, request);
  if ("response" in guarded) return guarded.response;

  const picked = pickFields(guarded.body, LEAD_FIELDS);
  if (!picked.ok) return json({ error: "Please check the form and try again." }, 400);
  if (picked.value.referral_acknowledgment !== true) return json({ error: "Please accept the consent box." }, 400);

  const user = request.headers.get("Authorization") ? await getUser(env, request) : null;
  const save = (extra: Record<string, unknown>) =>
    db(env, "leads", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...picked.value, marketing_consent: picked.value.marketing_consent === true, ...extra }),
    });
  let res = await save(user ? { customer_id: user.id } : {});
  // Before supabase/schema-customers.sql has been run there is no customer_id column: save the request without the link.
  if (user && res.status === 400) res = await save({});
  // 409 = the same idempotency key again: this exact request was already saved.
  if (res.status === 409) return json({ ok: true });
  if (res.status === 400) return json({ error: "Please check the form and try again." }, 400);
  if (!res.ok) return json({ error: "Could not send your request. Please try again." }, 502);
  return json({ ok: true });
};
