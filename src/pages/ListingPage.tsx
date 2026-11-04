import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Globe, Mail, MapPin, Phone, Siren, ThumbsUp } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeaturedRecommendation } from "@/components/directory/FeaturedRecommendation";
import { OpenNow } from "@/components/directory/Hours";
import { ListingSidebar } from "@/components/directory/ListingSidebar";
import { telHref } from "@/components/directory/ListingCard";
import { FeaturedBadge, GoogleReviews, LicenseBadge, VerifiedBadge } from "@/components/directory/Rating";
import { Recommendations } from "@/components/directory/Recommendations";
import { SimilarBusinesses } from "@/components/directory/SimilarBusinesses";
import { DAYS, cleanHours } from "@/lib/hours";
import { buttonClass } from "@/components/ui/Button";
import { siteConfig } from "@/config/site";
import { safeUrl, usePublishedListing } from "@/lib/directory";
import { imageUrl } from "@/lib/listing-images";
import { useListingRecommendations } from "@/lib/recommendations";
import { usePageMeta } from "@/lib/use-page-meta";

export default function ListingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: l, loading } = usePublishedListing(slug);

  const jsonLd = useMemo(() => {
    if (!l) return null;
    const hours = cleanHours(l.business_hours);
    const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return {
      "@context": "https://schema.org",
      "@type": "HVACBusiness",
      name: l.business_name,
      description: l.description || undefined,
      url: `${siteConfig.url}/directory/${l.slug}`,
      telephone: l.phone || undefined,
      address: { "@type": "PostalAddress", streetAddress: l.address || undefined, addressLocality: l.city, addressRegion: l.state, postalCode: l.postal_code || undefined },
      openingHoursSpecification: hours
        ? DAYS.flatMap((d, i) => (hours[d.key] ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: weekdays[i], opens: hours[d.key]!.open, closes: hours[d.key]!.close }] : []))
        : undefined,
    };
  }, [l]);

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
  const cover = imageUrl(l?.cover_image_path);
  const avatar = imageUrl(l?.avatar_path);
  const recommendations = useListingRecommendations(l?.id);

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
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
            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {(cover || avatar) && (
                <div className="-mx-6 -mt-6 mb-4 sm:-mx-8 sm:-mt-8">
                  <div className="aspect-[16/5] max-h-64 w-full overflow-hidden bg-gradient-to-br from-blue-100 to-slate-200">
                    {cover && <img src={cover} alt="" className="size-full object-cover" fetchPriority="high" />}
                  </div>
                  {avatar && (
                    <img src={avatar} alt={`${l.business_name} logo`} className="relative -mt-12 ml-6 size-24 rounded-2xl border-4 border-white bg-white object-cover shadow-sm sm:-mt-14 sm:ml-8 sm:size-28" />
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 empty:hidden">
                <FeaturedBadge listing={l} />
                <VerifiedBadge listing={l} />
                <LicenseBadge listing={l} />
              </div>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy">{l.business_name}</h1>
              <GoogleReviews listing={l} />
              <p className="mt-2 flex items-center gap-1.5 text-slate-600">
                <MapPin className="size-4" aria-hidden />
                {l.city}, {l.state}
              </p>
              <OpenNow listing={l} />
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
                <a href="#recommendations" className={buttonClass("secondary")}><ThumbsUp className="size-4" aria-hidden /> Recommend</a>
              </div>

              <FeaturedRecommendation listing={l} items={recommendations} />

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
              {l.attribution && <p className="mt-8 text-xs text-slate-500">{l.attribution}</p>}
              {l.service_areas && (
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-navy">Service areas</h2>
                  <p className="mt-2 text-slate-700">{l.service_areas}</p>
                </section>
              )}
              <Recommendations listing={l} items={recommendations} />
              <SimilarBusinesses listing={l} />

              <p className="mt-8 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                This listing was provided by the business. {siteConfig.brand.name} does not verify insurance, pricing or availability, and checks a license number only where the badge says &quot;License verified&quot;.
                Confirm credentials directly with any contractor before hiring.
              </p>
            </article>
            <ListingSidebar listing={l} />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
