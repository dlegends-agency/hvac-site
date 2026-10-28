import { faqs } from "@/config/faq";
import { FaqList } from "@/components/seo/FaqList";
import { reveal } from "@/lib/reveal";

export function FAQAccordion() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-site items-start gap-10 px-4 sm:px-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="hidden lg:sticky lg:top-28 lg:block" {...reveal()}>
          <div className="relative mx-auto max-w-[400px]">
            <div aria-hidden className="absolute -right-4 -bottom-4 h-full w-full rounded-3xl bg-sky-100" />
            <img src="/images/faq-family.jpg" alt="Family relaxing on a sofa under a wall-mounted air conditioner" width={900} height={1350}
              loading="lazy" decoding="async" className="relative w-full rounded-3xl shadow-xl ring-8 ring-white" />
          </div>
        </div>
        <div {...reveal(1)}>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">Got questions?</p>
          <h2 id="faq-title" className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Frequently Asked Questions</h2>
          <p className="mt-3 mb-7 text-slate-600">Here are some common questions about how our HVAC repair referral service works.</p>
          <FaqList faqs={faqs} />
        </div>
      </div>
    </section>
  );
}
