import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { breadcrumbLd, webPageLd } from "@/lib/schema";
import { usePublishedPosts } from "@/lib/blog";
import { usePageMeta } from "@/lib/use-page-meta";

export default function BlogIndexPage() {
  usePageMeta({
    title: "HVAC Repair Blog | Heating and AC Guides",
    description: "Practical guides on heating and air conditioning problems, what to expect from repairs, and when to call a professional.",
    path: "/blog",
    jsonLd: [
      { ...webPageLd("HVAC Repair Blog", "Guides on heating and cooling problems.", "/blog"), "@type": "CollectionPage" },
      breadcrumbLd([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }]),
    ],
  });
  const { data: posts, loading } = usePublishedPosts();

  return (
    <>
      <Header />
      <main className="bg-surface py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-navy">HVAC Repair Blog</h1>
          <p className="mt-3 mb-8 max-w-2xl text-lg text-slate-600">Guides on heating and cooling problems and what to do about them.</p>
          {loading ? (
            <p className="text-slate-600">Loading articles…</p>
          ) : posts.length === 0 ? (
            <p className="text-slate-600">No articles have been published yet.</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <li key={p.slug} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {p.cover_image && (
                    <Link to={`/blog/${p.slug}`} tabIndex={-1} aria-hidden>
                      <img src={p.cover_image} alt="" loading="lazy" width={1200} height={630} className="aspect-[1200/630] w-full object-cover" />
                    </Link>
                  )}
                  <div className="flex flex-1 flex-col p-6">
                  <h2 className="text-lg font-bold leading-snug text-navy">
                    <Link to={`/blog/${p.slug}`} className="hover:text-primary">{p.title}</Link>
                  </h2>
                  {p.published_at && (
                    <p className="mt-1 text-sm text-slate-500">
                      <time dateTime={p.published_at}>{new Date(p.published_at).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" })}</time>
                    </p>
                  )}
                  {p.excerpt && <p className="mt-3 line-clamp-3 text-slate-700">{p.excerpt}</p>}
                  <Link to={`/blog/${p.slug}`} className="mt-auto inline-block pt-4 text-sm font-semibold text-primary">Read article →</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
