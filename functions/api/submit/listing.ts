// POST /api/submit/listing   { captcha, id, slug, business_name, phone, address, city, state, postal_code, submitter_name, submitter_email }
// A business submitted from the "List your business" page. Checks the CAPTCHA, then saves a pending listing (always free, never
// published) and the submitter's private contact details for an admin to review.
import { db, json, type Env } from "../../_lib/stripe";
import { pickFields, readGuarded, type Spec } from "../../_lib/submit";

const LISTING_FIELDS: Spec = { id: "u", slug: "slug", business_name: "t", phone: "t", address: "t", city: "t", state: "t", postal_code: "t" };
const PRIVATE_FIELDS: Spec = { submitter_name: "t", submitter_email: "t" };

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const guarded = await readGuarded(env, request);
  if ("response" in guarded) return guarded.response;

  const listing = pickFields(guarded.body, LISTING_FIELDS);
  const priv = pickFields(guarded.body, PRIVATE_FIELDS);
  if (!listing.ok || !priv.ok) return json({ error: "Please check the form and try again." }, 400);

  const saved = await db(env, "listings", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...listing.value, status: "pending", plan: "free", source: "submitted" }),
  });
  if (saved.status === 409) return json({ error: "That business is already listed or waiting for review." }, 409);
  if (saved.status === 400) return json({ error: "Please check the form and try again." }, 400);
  if (!saved.ok) return json({ error: "Could not save your listing. Please try again." }, 502);

  const contact = await db(env, "listing_private", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ listing_id: listing.value.id, ...priv.value }),
  });
  if (!contact.ok) return json({ error: "Could not save your listing. Please try again." }, 502);
  return json({ ok: true });
};
