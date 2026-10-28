import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";
import { staticRoutes } from "./config/routes";
import { siteConfig } from "./config/site";
import { takeSeo } from "./lib/seo-store";

export const siteUrl = siteConfig.url;
export const brandName = siteConfig.brand.name;

export const prerenderRoutes: string[] = staticRoutes;

export function render(url: string) {
  takeSeo();
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
  return { html, meta: takeSeo() };
}
