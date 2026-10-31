import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { FaqList } from "@/components/seo/FaqList";
import { buttonClass } from "@/components/ui/Button";
import { leadPrice, plans, pricingFaq, yearlySaving } from "@/config/pricing";
import { siteConfig } from "@/config/site";
import { breadcrumbLd, faqLd, webPageLd } from "@/lib/schema";
import { usePageMeta } from "@/lib/use-page-meta";

export default function PricingPage() {
  const { brand } = siteConfig;
  const title = `Pricing for HVAC Contractors | ${brand.name}`;
  const description = `List your HVAC business free, or go Featured for $10 a month or $99 a year. See customer requests near you and unlock each one's full details for $${leadPrice.free} (Free) or $${leadPrice.paid} (Featured).`;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }];
  usePageMeta({
    title, description, path: "/pricing",
    jsonLd: [webPageLd(title, description, "/pricing"), breadcrumbLd(crumbs), faqLd(pricingFaq)],
  });
  const [interval, setInterval] = useState<"month" | "year">("year");

  return (
    <>
      <Header />
      <main className="bg-surface">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-site px-4 py-12 sm:px-6">
            <Breadcrumbs crumbs={crumbs} />
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy">Plans for HVAC contractors</h1>
            <p className="mt-3 max-w-2xl text-lg text-slate-600">
              Get listed for free. Go Featured to show your full business in the directory and pay less for each customer request. Paid plans are advertising: they
              give your listing more visibility and don&apos;t guarantee customer requests or jobs.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-site px-4 py-12 sm:px-6" aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="sr-only">Plans</h2>
          <div role="group" aria-label="Billing period" className="mb-8 inline-flex rounded-full border border-slate-300 bg-white p-1 text-sm font-semibold">
            {(["month", "year"] as const).map((i) => (
              <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval(i)}
                className={`rounded-full px-5 py-2 ${interval === i ? "bg-primary text-white" : "text-navy hover:bg-slate-50"}`}>
                {i === "month" ? "Monthly" : <>Yearly <span className={interval === i ? "text-blue-100" : "text-green-700"}>save ${yearlySaving}</span></>}
              </button>
            ))}
          </div>

          <ul className="grid gap-6 md:grid-cols-2 lg:max-w-4xl">
            {plans.map((p) => (
              <li key={p.id} className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${p.highlight ? "border-primary ring-2 ring-primary/20" : "border-slate-200"}`}>
                {p.highlight && <p className="mb-3 w-fit rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">Recommended</p>}
                <h3 className="text-xl font-bold text-navy">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{p.blurb}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-navy">{p.price[interval] === 0 ? "Free" : `$${p.price[interval]}`}</span>
                  {p.price[interval] > 0 && <span className="text-slate-600">/ {interval === "month" ? "month" : "year"}</span>}
                </p>
                {p.price.year > 0 && interval === "year" && <p className="mt-1 text-sm text-slate-600">That&apos;s about ${(p.price.year / 12).toFixed(2)} a month.</p>}
                <ul className="mt-6 space-y-3 text-sm text-slate-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> {f}</li>
                  ))}
                  {p.locked?.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-slate-500"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {f} <span className="text-xs">(Featured only)</span></li>
                  ))}
                </ul>
                <div className="flex-1" />
                <Link to={`/contractor/login?mode=signup${p.id === "free" ? "" : `&plan=${p.id}&interval=${interval}`}`} className={buttonClass(p.highlight ? "primary" : "secondary", "mt-8 !rounded-full")}>
                  {p.id === "free" ? "Create a free account" : `Get Featured, ${interval === "month" ? "monthly" : "yearly"}`}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-10 max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-navy">How customer requests work</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>A customer near you asks for help on our site. We send the request to up to three nearby contractors, paid listings first.</li>
              <li>You see the customer&apos;s <strong>name and the problem</strong> in your dashboard (and in an email alert).</li>
              <li>If you want the job, <strong>unlock the request</strong> to see their phone, email, address and message: <strong>${leadPrice.free}</strong> on the Free plan or <strong>${leadPrice.paid}</strong> on Featured. You only pay for the requests you unlock.</li>
              <li>Call the customer and keep track of the request as contacted, won or lost.</li>
            </ol>
          </div>
          <p className="mt-6 text-sm text-slate-600">
            Prices are in US dollars, billed through Stripe. Cancel any time. Already have an account? <Link to="/contractor/login" className="font-semibold text-primary hover:underline">Contractor sign in</Link>.
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
