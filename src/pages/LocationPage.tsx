import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LeadCaptureForm } from "@/components/form/LeadCaptureForm";
import { CityListings } from "@/components/directory/CityListings";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { FaqList } from "@/components/seo/FaqList";
import { OpenFormButton } from "@/components/OpenFormButton";
import { buttonClass } from "@/components/ui/Button";
import type { FaqItem } from "@/config/faq";
import { getLocation, locationLabel, type ServiceLocation } from "@/config/locations";
import { servicePages, servicePath } from "@/config/serviceContent";
import { siteConfig } from "@/config/site";
import { breadcrumbLd, faqLd, webPageLd, type Crumb } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";
import NotFoundPage from "@/pages/NotFoundPage";

const cityServices = ["ac-repair", "emergency-ac-repair", "furnace-repair", "heat-pump-repair", "ac-replacement", "mini-split-installation", "commercial-hvac-repair", "hvac-financing"];

function locationFaqs(loc: ServiceLocation): FaqItem[] {
  const place = loc.type === "city" ? `${loc.name}, ${loc.state}` : loc.name;
  return [
    { question: `How do I find an HVAC contractor in ${loc.name}?`, answer: `Submit a service request describing your heating or cooling problem and your address, or browse the directory for businesses listed in ${place}. We help look for suitable independent contractors where available. Always verify licensing and insurance yourself.` },
    { question: `Do you guarantee a contractor will serve my ${loc.name} address?`, answer: `No. Contractor coverage in ${place} has not been confirmed, and availability varies. We can't promise a match, a response time or a booking.` },
    { question: `Can I request emergency AC or furnace repair in ${loc.name}?`, answer: `Yes, you can mark your request as urgent. That doesn't guarantee that a contractor is available, and we can't promise response times. If there is a gas smell or carbon monoxide alarm, leave the building and contact emergency services or your utility first.` },
    { question: `Is HVAC repair in ${loc.name} different from other places?`, answer: loc.context },
  ];
}

export default function LocationPage({ slug }: { slug: string }) {
  const loc = getLocation(slug);
  const faqs = useMemo(() => (loc ? locationFaqs(loc) : []), [loc]);
  const crumbs: Crumb[] = useMemo(
    () => (loc ? [{ name: "Home", path: "/" }, ...(loc.type === "city" ? [{ name: loc.state, path: getLocation(loc.state.toLowerCase())?.path ?? "/" }] : []), { name: `HVAC Contractor ${loc.name}`, path: loc.path }] : []),
    [loc],
  );

  const title = loc ? `HVAC Contractor ${loc.name}${loc.type === "city" ? `, ${loc.state}` : ""} | Repair Help` : "Not found";
  const description = loc
    ? `Looking for an HVAC contractor in ${locationLabel(loc)}? Tell us about your heating or AC problem. We help you look for suitable local repair options.`
    : "";

  usePageMeta(
    loc
      ? { title, description, path: loc.path, jsonLd: [webPageLd(title, description, loc.path), breadcrumbLd(crumbs), faqLd(faqs)] }
      : { title: "Page not found | Emergency HVAC Repair", noindex: true },
  );

  if (!loc) return <NotFoundPage />;

  const nearby = loc.nearby.map(getLocation).filter((l): l is ServiceLocation => Boolean(l));

  return (
    <>
      <Header />
      <main>
        <section className="bg-surface">
          <div className="mx-auto max-w-site px-4 py-12 sm:px-6 sm:py-16">
            <Breadcrumbs crumbs={crumbs} />
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">
              HVAC Contractor in {locationLabel(loc)}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-700">
              Having trouble with your heating or air conditioning in {loc.name}? Tell us what&apos;s happening and where you&apos;re located.
              We&apos;ll help you look for a suitable independent HVAC contractor for your repair needs.
            </p>
            <p className="mt-3 max-w-3xl text-slate-600">{loc.context}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <OpenFormButton className="px-7 py-4 text-lg">Find HVAC Help in {loc.name}</OpenFormButton>
              <Link to="/directory" className={buttonClass("secondary", "px-7 py-4 text-lg")}>Browse the directory</Link>
            </div>
            <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              Contractor coverage in {loc.name} hasn&apos;t been confirmed, and we can&apos;t guarantee availability, pricing or response times.
            </p>
          </div>
        </section>

        <section aria-labelledby="loc-services" className="bg-white py-14">
          <div className="mx-auto max-w-site px-4 sm:px-6">
            <h2 id="loc-services" className="text-3xl font-bold tracking-tight text-navy">HVAC Help in {loc.name}</h2>
            <p className="mt-2 max-w-2xl text-slate-600">Common heating and cooling needs. Select a topic to learn more, then request help for your address.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cityServices.map((s) => servicePages.find((p) => p.slug === s)).filter(Boolean).map((p) => (
                <li key={p!.slug}>
                  <Link to={servicePath(p!.slug)} className="block h-full rounded-xl border border-slate-200 bg-surface p-4 font-semibold text-navy hover:border-primary">
                    {p!.name} <span className="font-normal text-slate-600">in {loc.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="loc-listings" className="bg-surface py-14">
          <div className="mx-auto max-w-site px-4 sm:px-6">
            <h2 id="loc-listings" className="text-3xl font-bold tracking-tight text-navy">HVAC Businesses Listed in {loc.name}</h2>
            <p className="mt-2 mb-8 max-w-2xl text-slate-600">Listings are provided by the businesses. We don&apos;t verify licensing, insurance or availability.</p>
            <CityListings location={loc} />
          </div>
        </section>

        <div className="bg-white py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <LeadCaptureForm id="lead-form" source={loc.slug} title={`Request HVAC Help in ${loc.name}`}
              description="Share a few details so we can understand your repair needs and service location." />
          </div>
        </div>

        <section aria-labelledby="loc-faq" className="bg-surface py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 id="loc-faq" className="mb-6 text-3xl font-bold tracking-tight text-navy">HVAC Contractor in {loc.name}: FAQ</h2>
            <FaqList faqs={faqs} />
          </div>
        </section>

        <section aria-labelledby="loc-nearby" className="bg-white py-12">
          <div className="mx-auto max-w-site px-4 sm:px-6">
            <h2 id="loc-nearby" className="text-xl font-bold text-navy">Other Areas</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {nearby.map((n) => (
                <li key={n.slug}><Link to={n.path} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-navy hover:border-primary">HVAC Contractor {n.name}</Link></li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-slate-500">{siteConfig.brand.name} is a referral service. Contractors are independent businesses.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
