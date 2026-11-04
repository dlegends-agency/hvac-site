# config

## Overview
Static, build-time site content and constants (brand, nav, services, locations, pricing, FAQs, form options). No runtime I/O.

## Interface
- `site.ts`: `siteConfig`, `NavItem`, `SiteConfig`.
- `services.ts`: `services`, `HVAC_ISSUES`, `URGENCY_OPTIONS`, `ServiceCategory`, `HvacIssue`, `ServiceIcon`.
- `serviceContent.ts`: `servicePages`, `getServicePage`, `servicePath`, `ServicePageContent`, `ContentSection`.
- `locations.ts`: `locations`, `locationPagesPublished`, `getLocation`, `locationLabel`, `ServiceLocation`.
- `pricing.ts`: `plans`, `leadPrice`, `planName`, `yearlySaving`, `pricingFaq`, `Plan`.
- `faq.ts`: `faqs`, `FaqItem`.
- `form.ts`: `countries`, `defaultCountry`, `getCountry`, `CONTACT_METHODS`, `PROPERTY_TYPES`, `PROPERTY_STATUSES`, `CountryConfig`.
- `routes.ts`: `staticRoutes` (used as `prerenderRoutes` in `entry-server.tsx` and by `lib/seo-audit/run.ts`).

## Invariants
- `App.tsx` builds one route per entry of `locations` and `servicePages`; slugs must be unique and reflected in `staticRoutes`.

## Side Effects
- None

## Verification
- Run: `npm run lint` and `npm run build` (runs `tsc --noEmit`, then vite client/SSR builds and `scripts/prerender.mjs`). package.json has no `test` script.
