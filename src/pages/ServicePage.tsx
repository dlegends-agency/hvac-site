import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LeadCaptureForm } from "@/components/form/LeadCaptureForm";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { FaqList } from "@/components/seo/FaqList";
import { OpenFormButton } from "@/components/OpenFormButton";
import { locations } from "@/config/locations";
import { getServicePage, servicePath } from "@/config/serviceContent";
import { breadcrumbLd, faqLd, webPageLd } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";
import NotFoundPage from "@/pages/NotFoundPage";

export default function ServicePage({ slug }: { slug: string }) {
  const page = getServicePage(slug);
  const path = servicePath(slug);
  const crumbs = useMemo(
    () => [{ name: "Home", path: "/" }, { name: "HVAC Services", path: "/services" }, { name: page?.name ?? "", path }],
    [page, path],
  );

  usePageMeta(
    page
      ? {
          title: `${page.title} | Emergency HVAC Repair`.length > 60 ? page.title : `${page.title} | Emergency HVAC Repair`,
          description: page.metaDescription,
          path,
          jsonLd: [webPageLd(page.h1, page.metaDescription, path), breadcrumbLd(crumbs), faqLd(page.faqs)],
        }
      : { title: "Page not found | Emergency HVAC Repair", noindex: true },
  );

  if (!page) return <NotFoundPage />;
  const related = page.related.map(getServicePage).filter((p) => p !== undefined);
  const cities = locations.filter((l) => l.type === "city");

  return (
    <>
      <Header />
      <main>
        <section className="bg-surface">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-14">
            <Breadcrumbs crumbs={crumbs} />
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{page.h1}</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">{page.intro}</p>
            <div className="mt-6"><OpenFormButton issue={page.issue} className="px-7 py-3.5 text-lg">Request Help</OpenFormButton></div>
            <nav aria-label="On this page" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-semibold text-navy">On this page</p>
              <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                {page.sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-primary hover:underline">{s.heading}</a></li>)}
                <li><a href="#faq" className="text-primary hover:underline">Frequently asked questions</a></li>
              </ul>
            </nav>
          </div>
        </section>

        <article className="bg-white py-12">
          <div className="mx-auto max-w-3xl space-y-10 px-4 sm:px-6">
            {page.sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`} className="text-2xl font-bold text-navy">{s.heading}</h2>
                {s.paragraphs.map((p, i) => <p key={i} className="mt-3 text-lg leading-relaxed text-slate-700">{p}</p>)}
                {s.bullets && <ul className="mt-3 list-disc space-y-1.5 pl-6 text-lg text-slate-700">{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
              </section>
            ))}
            <aside className="rounded-2xl border border-orange-200 bg-emergency-soft p-5 text-sm text-slate-800">
              <strong className="text-navy">Safety first:</strong> if you smell gas, hear hissing near a gas line or a carbon monoxide alarm sounds, leave the building and contact your gas
              utility or local emergency services from a safe place. This page is general information, not a substitute for a professional diagnosis.
            </aside>
          </div>
        </article>

        <section id="faq" aria-labelledby="svc-faq" className="bg-surface py-12">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 id="svc-faq" className="mb-6 text-2xl font-bold text-navy">Frequently Asked Questions</h2>
            <FaqList faqs={page.faqs} />
          </div>
        </section>

        <div className="bg-white py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <LeadCaptureForm id="lead-form" source={`service-${page.slug}`} title={`Request Help: ${page.name}`} />
          </div>
        </div>

        <section className="bg-surface py-12" aria-labelledby="svc-more">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 id="svc-more" className="text-xl font-bold text-navy">Related topics</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {related.map((r) => <li key={r!.slug}><Link to={servicePath(r!.slug)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy hover:border-primary">{r!.name}</Link></li>)}
            </ul>
            <h2 className="mt-8 text-xl font-bold text-navy">Find an HVAC contractor by city</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {cities.map((c) => <li key={c.slug}><Link to={c.path} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy hover:border-primary">HVAC Contractor {c.name}</Link></li>)}
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
