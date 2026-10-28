import { locations } from "@/config/locations";
import { servicePages } from "@/config/serviceContent";

/** Public routes with fixed content. These are prerendered at build time and listed in the sitemap. */
export const staticRoutes: string[] = [
  "/",
  "/services",
  ...servicePages.map((p) => `/services/${p.slug}`),
  ...locations.map((l) => l.path),
  "/blog",
  "/directory",
  "/directory/add",
  "/contact",
  "/privacy-policy",
  "/terms-of-use",
];
