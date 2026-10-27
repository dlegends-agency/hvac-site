import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";
import { locations } from "./config/locations";
import { servicePages } from "./config/serviceContent";
import { siteConfig } from "./config/site";
import { takeSeo } from "./lib/seo-store";

export const siteUrl = siteConfig.url;

/** Every public route that has fixed content and is prerendered to static HTML at build time. */
export const prerenderRoutes: string[] = [
  "/",
  "/services",
  ...servicePages.map((p) => `/services/${p.slug}`),
  ...locations.map((l) => l.path),
  "/blog",
  "/directory",
  "/directory/add",
];

export function render(url: string) {
  takeSeo();
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
  return { html, meta: takeSeo() };
}
