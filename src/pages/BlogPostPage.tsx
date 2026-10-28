import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Markdown } from "@/components/Markdown";
import { siteConfig } from "@/config/site";
import { usePublishedPost } from "@/lib/blog";
import { usePageMeta } from "@/lib/use-page-meta";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, loading } = usePublishedPost(slug);

  const jsonLd = useMemo(
    () =>
      post && {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.meta_description || post.excerpt || undefined,
        image: post.cover_image ? `${siteConfig.url}${post.cover_image}` : undefined,
        datePublished: post.published_at,
        dateModified: post.updated_at,
        mainEntityOfPage: `${siteConfig.url}/blog/${post.slug}`,
        publisher: { "@type": "Organization", name: siteConfig.brand.name },
      },
    [post],
  );

  usePageMeta(
    post
      ? { title: post.title, description: post.meta_description || post.excerpt || undefined, path: `/blog/${post.slug}`, type: "article", image: post.cover_image ?? undefined, jsonLd: jsonLd ?? undefined }
      : { title: loading ? "Loading… | HVACHelp" : "Article not found", noindex: !loading },
  );

  return (
    <>
      <Header />
      <main className="bg-white">
        {loading ? (
          <p className="mx-auto max-w-3xl px-4 py-14 text-slate-600">Loading…</p>
        ) : !post ? (
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <h1 className="text-3xl font-bold text-navy">Article not found</h1>
            <p className="mt-3 text-slate-600">This article doesn&apos;t exist or isn&apos;t published.</p>
            <Link to="/blog" className="mt-4 inline-block font-semibold text-primary">← All articles</Link>
          </div>
        ) : (
          <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <p className="text-sm"><Link to="/blog" className="font-semibold text-primary">← All articles</Link></p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-navy">{post.title}</h1>
            {post.published_at && (
              <p className="mt-2 text-sm text-slate-500">
                <time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}</time>
              </p>
            )}
            {post.cover_image && (
              <img src={post.cover_image} alt={`Illustration for: ${post.title}`} width={1200} height={630}
                className="mt-8 aspect-[1200/630] w-full rounded-2xl border border-slate-200 object-cover" />
            )}
            <div className="mt-8"><Markdown source={post.content} /></div>
            <aside className="mt-12 rounded-2xl bg-navy p-6 text-center">
              <p className="text-xl font-bold text-white">Need help with your heating or cooling system?</p>
              <p className="mt-2 text-blue-100">Tell us about your problem and location and we&apos;ll help you find suitable local repair options.</p>
              <Link to="/#lead-form" className="mt-4 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-primary">Find HVAC Help</Link>
            </aside>
          </article>
        )}
      </main>
      <Footer />
    </>
  );
}
