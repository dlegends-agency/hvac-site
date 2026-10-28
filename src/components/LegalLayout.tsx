import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { breadcrumbLd, webPageLd } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";

export interface LegalSection {
  id: string;
  heading: string;
  content: ReactNode;
}

interface Props {
  title: string;
  /** <title> and meta description */
  seoTitle: string;
  description: string;
  path: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}

/** Shared layout for long-form policy pages: breadcrumbs, last-updated date, table of contents and numbered sections. */
export function LegalLayout({ title, seoTitle, description, path, updated, intro, sections }: Props) {
  const crumbs = [{ name: "Home", path: "/" }, { name: title, path }];
  usePageMeta({ title: seoTitle, description, path, jsonLd: [webPageLd(seoTitle, description, path), breadcrumbLd(crumbs)] });

  return (
    <>
      <Header />
      <main className="bg-surface py-12">
        <div className="mx-auto max-w-site px-4 sm:px-6">
          <Breadcrumbs crumbs={crumbs} />
          <div className="mt-5 grid gap-10 lg:grid-cols-[16rem_1fr]">
            <nav aria-label="On this page" className="hidden lg:block">
              <div className="sticky top-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-navy">On this page</p>
                <ol className="mt-3 space-y-2 text-sm">
                  {sections.map((s, i) => (
                    <li key={s.id}><a href={`#${s.id}`} className="text-slate-600 hover:text-primary hover:underline">{i + 1}. {s.heading}</a></li>
                  ))}
                </ol>
              </div>
            </nav>

            <article className="max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
              <h1 className="text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{title}</h1>
              <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-slate-700">{intro}</div>
              <div className="mt-8 space-y-9">
                {sections.map((s, i) => (
                  <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28">
                    <h2 id={`${s.id}-h`} className="text-2xl font-bold text-navy">{i + 1}. {s.heading}</h2>
                    <div className="mt-3 space-y-3 text-base leading-relaxed text-slate-700 [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6">{s.content}</div>
                  </section>
                ))}
              </div>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
