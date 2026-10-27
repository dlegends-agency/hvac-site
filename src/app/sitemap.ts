import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getPublishedPosts } from "@/lib/blog";

/** Only published URLs: the homepage, the blog index and published posts. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublishedPosts();
  return [
    { url: siteConfig.url, changeFrequency: "monthly", priority: 1 },
    { url: `${siteConfig.url}/blog`, changeFrequency: "weekly", priority: 0.6 },
    ...posts.map((p) => ({
      url: `${siteConfig.url}/blog/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
