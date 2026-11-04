// POST /api/submit/contact   { captcha, name, email, topic, message }
// A message from the Contact page. Checks the CAPTCHA, then saves it for the admin inbox.
import { db, json, type Env } from "../../_lib/stripe";
import { pickFields, readGuarded, type Spec } from "../../_lib/submit";

const CONTACT_FIELDS: Spec = { name: "t", email: "t", topic: "t", message: "T" };

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const guarded = await readGuarded(env, request);
  if ("response" in guarded) return guarded.response;

  const picked = pickFields(guarded.body, CONTACT_FIELDS);
  if (!picked.ok) return json({ error: "Please check the form and try again." }, 400);

  const res = await db(env, "contact_messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(picked.value) });
  if (res.status === 400) return json({ error: "Please check the form and try again." }, 400);
  if (!res.ok) return json({ error: "Could not send your message. Please try again." }, 502);
  return json({ ok: true });
};
