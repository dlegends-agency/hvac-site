import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { servicePages, servicePath } from "@/config/serviceContent";
import { breadcrumbLd, webPageLd } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";

const crumbs = [{ name: "Home", path: "/" }, { name: "HVAC Services", path: "/services" }];
const title = "HVAC Services and Repair Guides | HVACHelp";
const description = "Guides to common HVAC repair, replacement and installation topics: AC, furnace, heat pump, mini-split, commercial and more.";

export default function ServicesIndexPage() {
  usePageMeta({ title, description, path: "/services", jsonLd: [webPageLd(title, description, "/services"), breadcrumbLd(crumbs)] });
  return (
    <>
      <Header />
      <main className="bg-surface py-12">
        <div className="mx-auto max-w-site px-4 sm:px-6">
          <Breadcrumbs crumbs={crumbs} />
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy">HVAC Services and Repair Guides</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">Learn about common heating and cooling problems and projects, then request help for your address.</p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {servicePages.map((s) => (
              <li key={s.slug} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-navy"><Link to={servicePath(s.slug)} className="hover:text-primary">{s.name}</Link></h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-600">{s.metaDescription}</p>
                <Link to={servicePath(s.slug)} className="mt-4 text-sm font-semibold text-primary">Read the guide →</Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
