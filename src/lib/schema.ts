import { siteConfig } from "@/config/site";
import type { FaqItem } from "@/config/faq";

export interface Crumb {
  name: string;
  path: string;
}

export const absolute = (path: string) => `${siteConfig.url}${path === "/" ? "" : path}`;

export const breadcrumbLd = (crumbs: Crumb[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(c.path) })),
});

export const faqLd = (faqs: FaqItem[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
});

export const webPageLd = (name: string, description: string, path: string) => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name,
  description,
  url: absolute(path),
  isPartOf: { "@type": "WebSite", name: siteConfig.brand.name, url: siteConfig.url },
});
