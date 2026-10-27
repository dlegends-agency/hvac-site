import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getPublishedPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "HVAC Repair Blog | Heating and AC Guides",
  description: "Practical guides on heating and air conditioning problems, what to expect from repairs, and when to call a professional.",
  alternates: { canonical: "/blog" },
};

async function PostList() {
  const posts = await getPublishedPosts();
  if (posts.length === 0) return <p className="text-slate-600">No articles have been published yet.</p>;
  return (
    <ul className="space-y-5">
      {posts.map((p) => (
        <li key={p.slug} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-navy">
            <Link href={`/blog/${p.slug}`} className="hover:text-primary">{p.title}</Link>
          </h2>
          {p.published_at && (
            <p className="mt-1 text-sm text-slate-500">
              <time dateTime={p.published_at}>{new Date(p.published_at).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}</time>
            </p>
          )}
          {p.excerpt && <p className="mt-3 text-slate-700">{p.excerpt}</p>}
          <Link href={`/blog/${p.slug}`} className="mt-3 inline-block text-sm font-semibold text-primary">Read article →</Link>
        </li>
      ))}
    </ul>
  );
}

export default function BlogIndexPage() {
  return (
    <>
      <Header />
      <main className="bg-surface py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-navy">HVAC Repair Blog</h1>
          <p className="mt-3 mb-8 text-lg text-slate-600">Guides on heating and cooling problems and what to do about them.</p>
          <Suspense fallback={<p className="text-slate-600">Loading articles…</p>}>
            <PostList />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
