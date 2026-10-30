import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { FaqList } from "@/components/seo/FaqList";
import { buttonClass } from "@/components/ui/Button";
import { plans, pricingFaq } from "@/config/pricing";
import { siteConfig } from "@/config/site";
import { breadcrumbLd, faqLd, webPageLd } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";

export default function PricingPage() {
  const { brand } = siteConfig;
  const title = `Pricing for HVAC Contractors | ${brand.name}`;
  const description = `Plans for HVAC contractors: a free directory listing, Featured placement with a link to your Google reviews, and Premium with customer requests in your dashboard.`;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }];
  usePageMeta({
    title, description, path: "/pricing",
    jsonLd: [webPageLd(title, description, "/pricing"), breadcrumbLd(crumbs), faqLd(pricingFaq)],
  });

  return (
    <>
      <Header />
      <main className="bg-surface">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-site px-4 py-12 sm:px-6">
            <Breadcrumbs crumbs={crumbs} />
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy">Plans for HVAC contractors</h1>
            <p className="mt-3 max-w-2xl text-lg text-slate-600">
              Get listed for free, or pay for Featured placement in the directory. Paid plans are advertising: they give your listing more visibility and
              tools, and they don&apos;t guarantee customer requests or jobs.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-site px-4 py-12 sm:px-6" aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="sr-only">Plans</h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id} className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${p.highlight ? "border-primary ring-2 ring-primary/20" : "border-slate-200"}`}>
                {p.highlight && <p className="mb-3 w-fit rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">Most popular</p>}
                <h3 className="text-xl font-bold text-navy">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{p.blurb}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-navy">{p.price === 0 ? "Free" : `$${p.price}`}</span>
                  {p.price > 0 && <span className="text-slate-600">/ month</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> {f}</li>
                  ))}
                </ul>
                <Link to={`/contractor/login?mode=signup${p.id === "free" ? "" : `&plan=${p.id}`}`} className={buttonClass(p.highlight ? "primary" : "secondary", "mt-8 !rounded-full")}>
                  {p.price === 0 ? "Create a free account" : `Get ${p.name}`}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-600">
            Prices are in US dollars per month, billed through Stripe, and you can cancel any time. Already have an account? <Link to="/contractor/login" className="font-semibold text-primary hover:underline">Contractor sign in</Link>.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="pricing-faq">
          <h2 id="pricing-faq" className="text-2xl font-bold text-navy">Questions from contractors</h2>
          <div className="mt-5"><FaqList faqs={pricingFaq} /></div>
          <p className="mt-6 text-sm text-slate-600">
            {brand.name} is a referral service, not a contractor. Contractors are independent businesses. See the <Link to="/terms-of-use" className="text-primary underline">Terms of Use</Link> and <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link>,
            or <Link to="/contact" className="text-primary underline">contact us</Link> with questions.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
