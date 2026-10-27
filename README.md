# Emergency HVAC Repair: lead generation homepage

Next.js (App Router) + TypeScript + Tailwind CSS 4 + React Hook Form + Zod + Lucide.

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint && npx tsc --noEmit && npm run build
```

## Where things live

| Path | Purpose |
| --- | --- |
| `src/config/site.ts` | Brand, nav, contact details, SEO defaults, legal links |
| `src/config/services.ts` | Issue options, urgency options, service cards |
| `src/config/locations.ts` | Service areas (examples only, coverage unconfirmed) |
| `src/config/faq.ts` | FAQ content |
| `src/config/form.ts` | Countries (postal and phone rules), contact/property options |
| `src/lib/lead-schema.ts` | Zod schema shared by the browser form and `/api/leads` |
| `src/components/form/` | `LeadCaptureForm` (reusable), `useLeadForm` (logic), `LeadSteps` (UI) |
| `src/components/sections/` | Homepage sections |
| `src/app/api/leads/route.ts` | Lead intake endpoint |

## Lead form backend requirements (not yet connected)

The form posts JSON to `POST /api/leads`. **No backend is connected**, so the endpoint
validates the payload and returns `501 not_configured`; the UI then says the request was
**not** sent. It never shows a success message unless the endpoint returns 2xx.

To go live:

1. Set `LEAD_WEBHOOK_URL` (and optionally `LEAD_WEBHOOK_SECRET`, sent as `Authorization: Bearer`).
   The route forwards the validated lead as JSON plus `submittedAt` and `source`. Any CRM, Zapier,
   n8n or custom API that accepts a JSON POST works. Alternatively replace the `fetch` in the route
   with a database write or email send.
2. Set `NEXT_PUBLIC_LEAD_BACKEND_ENABLED=true` to remove the development-mode notice.
3. Add before launch: spam protection (CAPTCHA/Turnstile or honeypot plus rate limiting; none is
   included), server-side dedupe using the `Idempotency-Key` header the client sends, and storage
   and retention rules for personal data.
4. Record consent: `referralAcknowledgment` (required) and `marketingConsent` (optional) are in the
   payload. Store them with a timestamp. Text-message and marketing consent wording needs legal review
   (e.g. TCPA in the US).

Payload fields: `issue, urgency, country, state, city, postalCode, street, unit?, firstName, lastName,
phone, email, contactMethod, description?, propertyType, propertyStatus, preferredContactTime?,
referralAcknowledgment, marketingConsent, source`.

## Still to configure

- Final brand name, domain (`NEXT_PUBLIC_SITE_URL`), logo, phone, email, address.
- Privacy Policy, Terms of Use and Contact pages. Until `legal.*Href` is set in `site.ts`, the footer shows them as plain text instead of dead links.
- Confirmed service areas. Set `coverageConfirmed` per location and `locationPagesPublished` when `/hvac-repair-*` pages exist.
- Licensed imagery. The hero uses an original SVG illustration; no stock photos, logos, reviews or badges are used.
- Open Graph image (none yet) and, when location pages exist, a sitemap of published URLs only.
- FAQ wording on pricing and response time should be confirmed against your actual business terms.

## Reuse for location pages

`<LeadCaptureForm source="austin" title="..." />` is layout-agnostic. Section components read from `src/config`, so
a future `/hvac-repair-[city]` route can pass location data in and export its own `generateMetadata`.

## Supabase and admin (added)

1. Run `supabase/schema.sql` in the Supabase SQL Editor (creates `leads`, `admin_users`, RLS policies).
2. Authentication > Users > Add user (email + password, auto-confirm), then run the `insert into admin_users` snippet at the bottom of the SQL file with that email.
3. `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).
4. Sign in at `/admin/login`; leads are at `/admin`. The publishable key is safe in the browser; access is enforced by RLS (only users in `admin_users` can read or update leads; the public can only insert).
5. Not included: spam protection on the public form. Never put the `service_role` key in this project.

## Blog, reports and analytics (added)

- Run `supabase/schema-blog-analytics.sql` after `schema.sql` (creates `posts` and `page_views` with RLS).
- Admin: `/admin` (reports), `/admin/leads` (+ detail with status and notes), `/admin/blog` (write/publish posts, Markdown), `/admin/analytics`.
- Public: `/blog`, `/blog/[slug]` (metadata, canonical, Article JSON-LD), `/sitemap.xml` (published URLs only), `/robots.txt`.
- Analytics is a built-in, cookie-free tracker (path, referrer host, UTM source, device class, random browser id). Mention it in your privacy policy.
