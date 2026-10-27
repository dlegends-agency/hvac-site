import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Markdown } from "@/components/Markdown";
import { siteConfig } from "@/config/site";
import { getPublishedPost } from "@/lib/blog";

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Article not found", robots: { index: false } };
  const description = post.meta_description || post.excerpt || undefined;
  return {
    title: post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `/blog/${post.slug}`,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
    },
  };
}

async function Article({ params }: { params: PageProps<"/blog/[slug]">["params"] }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.excerpt || undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: `${siteConfig.url}/blog/${post.slug}`,
    publisher: { "@type": "Organization", name: siteConfig.brand.name },
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <p className="text-sm"><Link href="/blog" className="font-semibold text-primary">← All articles</Link></p>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-navy">{post.title}</h1>
      {post.published_at && (
        <p className="mt-2 text-sm text-slate-500">
          <time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}</time>
        </p>
      )}
      <div className="mt-8"><Markdown source={post.content} /></div>
      <aside className="mt-12 rounded-2xl bg-navy p-6 text-center">
        <p className="text-xl font-bold text-white">Need help with your heating or cooling system?</p>
        <p className="mt-2 text-blue-100">Tell us about your problem and location and we&apos;ll help you find suitable local repair options.</p>
        <Link href="/#lead-form" className="mt-4 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-primary">Find HVAC Help</Link>
      </aside>
    </article>
  );
}

export default function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  return (
    <>
      <Header />
      <main className="bg-white">
        <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-14 text-slate-600">Loading…</p>}>
          <Article params={params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
