// GET /api/recommend/confirm?t=<token>
// The customer opens the link from the confirmation email. This marks their email as confirmed (the recommendation then waits for
// an admin to approve it) and sends them to the business page. A link works once and expires after 7 days.
import { hashToken, isToken } from "../../_lib/recommend";
import { escapeHtml } from "../../_lib/email";
import { db, siteOrigin, type Env } from "../../_lib/stripe";

const page = (title: string, text: string, home: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>` +
      `<body style="font-family:Arial,Helvetica,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#14213d"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><p><a href="${escapeHtml(home)}/directory">Back to the directory</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export const onRequestGet = async ({ env, request }: { env: Env; request: Request }) => {
  const site = siteOrigin(env, request);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return page("Not available", "Recommendations are not switched on yet.", site, 501);

  const token = new URL(request.url).searchParams.get("t");
  if (!isToken(token)) return page("Link not valid", "This confirmation link is not valid.", site, 400);

  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const hash = await hashToken(token);
  const res = await db(env, `listing_recommendations?token_hash=eq.${hash}&email_confirmed_at=is.null&created_at=gt.${encodeURIComponent(since)}&select=listing_id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ email_confirmed_at: new Date().toISOString() }),
  });
  if (!res.ok) return page("Something went wrong", "We could not confirm your email. Please try the link again in a few minutes.", site, 502);
  const row = ((await res.json()) as { listing_id: string }[])[0];
  if (!row) return page("Link already used or expired", "This link was already used or has expired. If you have already confirmed, your recommendation is waiting for our team to read it.", site, 410);

  const l = await db(env, `listings?id=eq.${encodeURIComponent(row.listing_id)}&select=slug&limit=1`);
  const slug = l.ok ? ((await l.json()) as { slug: string }[])[0]?.slug : undefined;
  if (!slug) return page("Thank you", "Your email is confirmed. Our team will read your recommendation before it is shown.", site);
  return new Response(null, { status: 302, headers: { Location: `${site}/directory/${slug}?recommendation=confirmed`, "Cache-Control": "no-store" } });
};
