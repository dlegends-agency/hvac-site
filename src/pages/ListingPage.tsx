import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Globe, Mail, MapPin, Phone, Siren } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { telHref } from "@/components/directory/ListingCard";
import { buttonClass } from "@/components/ui/Button";
import { siteConfig } from "@/config/site";
import { safeUrl, usePublishedListing } from "@/lib/directory";
import { usePageMeta } from "@/lib/use-page-meta";

export default function ListingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: l, loading } = usePublishedListing(slug);

  const jsonLd = useMemo(
    () =>
      l && {
        "@context": "https://schema.org",
        "@type": "HVACBusiness",
        name: l.business_name,
        description: l.description || undefined,
        url: `${siteConfig.url}/directory/${l.slug}`,
        telephone: l.phone || undefined,
        address: { "@type": "PostalAddress", streetAddress: l.address || undefined, addressLocality: l.city, addressRegion: l.state, postalCode: l.postal_code || undefined },
      },
    [l],
  );

  usePageMeta(
    l
      ? {
          title: `${l.business_name} | HVAC in ${l.city}, ${l.state}`,
          description: l.description?.slice(0, 155) || `${l.business_name} is an HVAC business listed in ${l.city}, ${l.state}.`,
          path: `/directory/${l.slug}`,
          jsonLd: jsonLd ?? undefined,
        }
      : { title: loading ? "Loading… | HVACHelp" : "Listing not found", noindex: !loading },
  );

  const website = safeUrl(l?.website);

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          <Link to="/directory" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            <ArrowLeft className="size-4" aria-hidden /> All businesses
          </Link>

          {loading ? (
            <p className="mt-6 text-slate-600">Loading…</p>
          ) : !l ? (
            <div className="mt-6">
              <h1 className="text-3xl font-bold text-navy">Listing not found</h1>
              <p className="mt-2 text-slate-600">This business isn&apos;t listed, or the listing was removed.</p>
            </div>
          ) : (
            <article className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h1 className="text-3xl font-extrabold tracking-tight text-navy">{l.business_name}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-slate-600">
                <MapPin className="size-4" aria-hidden />
                {[l.address, `${l.city}, ${l.state}`, l.postal_code].filter(Boolean).join(" · ")}
              </p>
              {l.emergency_service && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emergency-soft px-3 py-1 text-sm font-semibold text-emergency">
                  <Siren className="size-4" aria-hidden /> Says it offers emergency service
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                {l.phone && <a href={telHref(l.phone)} className={buttonClass("primary")}><Phone className="size-4" aria-hidden /> {l.phone}</a>}
                {l.email && <a href={`mailto:${l.email}`} className={buttonClass("secondary")}><Mail className="size-4" aria-hidden /> Email</a>}
                {website && (
                  <a href={website} target="_blank" rel="nofollow ugc noopener noreferrer" className={buttonClass("secondary")}>
                    <Globe className="size-4" aria-hidden /> Website
                  </a>
                )}
              </div>

              {l.description && (
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-navy">About</h2>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-700">{l.description}</p>
                </section>
              )}
              {l.services.length > 0 && (
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-navy">Services</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {l.services.map((s) => <li key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{s}</li>)}
                  </ul>
                </section>
              )}
              {l.service_areas && (
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-navy">Service areas</h2>
                  <p className="mt-2 text-slate-700">{l.service_areas}</p>
                </section>
              )}

              <p className="mt-8 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                This listing was provided by the business. {siteConfig.brand.name} does not verify licensing, insurance, pricing or availability.
                Confirm credentials directly with any contractor before hiring.
              </p>
            </article>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
