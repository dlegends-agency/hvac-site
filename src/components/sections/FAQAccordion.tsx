import { faqs } from "@/config/faq";
import { FaqList } from "@/components/seo/FaqList";

export function FAQAccordion() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="hidden overflow-hidden rounded-3xl shadow-lg shadow-slate-900/10 lg:block">
          <img src="/images/faq-family.jpg" alt="Family relaxing in a comfortable living room" width={1320} height={748}
            loading="lazy" decoding="async" className="h-[420px] w-full object-cover object-[45%_50%]" />
        </div>
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">Got questions?</p>
          <h2 id="faq-title" className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Frequently Asked Questions</h2>
          <p className="mt-3 mb-7 text-slate-600">Here are some common questions about how our HVAC repair referral service works.</p>
          <FaqList faqs={faqs} />
        </div>
      </div>
    </section>
  );
}
