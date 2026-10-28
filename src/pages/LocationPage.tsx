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
import { reveal } from "@/lib/reveal";
import { buttonClass } from "@/components/ui/Button";
import type { FaqItem } from "@/config/faq";
import { getLocation, locationLabel, type ServiceLocation } from "@/config/locations";
import { servicePages, servicePath } from "@/config/serviceContent";
import { siteConfig } from "@/config/site";
import { breadcrumbLd, faqLd, webPageLd, type Crumb } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";
import NotFoundPage from "@/pages/NotFoundPage";

const serviceImages: Record<string, string> = {
  "ac-repair": "/images/svc-ac-repair.jpg",
  "emergency-ac-repair": "/images/svc-emergency-ac.jpg",
  "furnace-repair": "/images/svc-furnace.jpg",
  "heat-pump-repair": "/images/svc-heating.jpg",
  "ac-replacement": "/images/svc-breakdown.jpg",
  "mini-split-installation": "/images/svc-leaks.jpg",
  "commercial-hvac-repair": "/images/svc-commercial.jpg",
  "hvac-financing": "/images/svc-thermostat.jpg",
};

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
      : { title: "Page not found | HVACHelp", noindex: true },
  );

  if (!loc) return <NotFoundPage />;

  const nearby = loc.nearby.map(getLocation).filter((l): l is ServiceLocation => Boolean(l));

  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-sky-50 to-white">
          <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-sky-100/80 blur-3xl" />
          <div className="relative mx-auto grid max-w-site items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <Breadcrumbs crumbs={crumbs} />
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">
                HVAC Contractor in {locationLabel(loc)}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-700">
                Having trouble with your heating or air conditioning in {loc.name}? Tell us what&apos;s happening and where you&apos;re located.
                We&apos;ll help you look for a suitable independent HVAC contractor for your repair needs.
              </p>
              <p className="mt-3 max-w-2xl text-slate-600">{loc.context}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <OpenFormButton className="!rounded-full px-7 py-4 text-base">Find HVAC Help in {loc.name}</OpenFormButton>
                <Link to="/directory" className={buttonClass("secondary", "!rounded-full px-7 py-4 text-base")}>Browse the directory</Link>
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                Contractor coverage in {loc.name} hasn&apos;t been confirmed, and we can&apos;t guarantee availability, pricing or response times.
              </p>
            </div>
            <div className="anim-fade-in relative mx-auto w-full max-w-xl py-4">
              <div aria-hidden className="absolute inset-x-6 inset-y-0 rotate-3 rounded-[2.5rem] bg-gradient-to-br from-sky-200/80 via-blue-100/60 to-white" />
              <div className="relative overflow-hidden rounded-[2rem] shadow-2xl shadow-blue-900/20 ring-[10px] ring-white">
                <img src={loc.image} alt={loc.imageAlt} width={800} height={600} fetchPriority="high" decoding="async"
                  className={`aspect-[4/3] w-full object-cover ${loc.imageFocus}`} />
              </div>
              <p className="anim-float absolute -bottom-1 left-4 z-10 flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-sm font-bold text-navy shadow-xl ring-1 ring-slate-100 backdrop-blur sm:left-8">
                <MapPin className="size-5 fill-primary text-white" aria-hidden /> HVAC help in {loc.name}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="loc-services" className="bg-white py-14">
          <div className="mx-auto max-w-site px-4 sm:px-6">
            <h2 id="loc-services" className="text-3xl font-bold tracking-tight text-navy">HVAC Help in {loc.name}</h2>
            <p className="mt-2 max-w-2xl text-slate-600">Common heating and cooling needs. Select a topic to learn more, then request help for your address.</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {cityServices.map((s) => servicePages.find((p) => p.slug === s)).filter(Boolean).map((p, i) => (
                <li key={p!.slug} {...reveal(i)}>
                  <Link to={servicePath(p!.slug)} className="group block h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-blue-900/10">
                    <span className="block overflow-hidden">
                      <img src={serviceImages[p!.slug] ?? "/images/svc-ac-repair.jpg"} alt="" width={800} height={500} loading="lazy" decoding="async"
                        className="aspect-[8/5] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    </span>
                    <span className="block p-4 font-semibold text-navy">
                      {p!.name} <span className="font-normal text-slate-600">in {loc.name}</span>
                    </span>
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
          <div className="mx-auto grid max-w-site items-start gap-10 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="hidden lg:sticky lg:top-28 lg:block" {...reveal()}>
              <div className="relative mx-auto max-w-[360px]">
                <div aria-hidden className="absolute -right-4 -bottom-4 h-full w-full rounded-3xl bg-sky-100" />
                <img src="/images/faq-family.jpg" alt="Family relaxing on a sofa under a wall-mounted air conditioner" width={900} height={1350}
                  loading="lazy" decoding="async" className="relative w-full rounded-3xl shadow-xl ring-8 ring-white" />
              </div>
            </div>
            <div {...reveal(1)}>
              <LeadCaptureForm id="lead-form" source={loc.slug} title={`Request HVAC Help in ${loc.name}`}
                description="Share a few details so we can understand your repair needs and service location." />
            </div>
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
