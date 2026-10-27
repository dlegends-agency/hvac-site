import { faqs } from "@/config/faq";
import { FaqList } from "@/components/seo/FaqList";
import { SectionHeading } from "./SectionHeading";

export function FAQAccordion() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading id="faq-title" title="Frequently Asked Questions" />
        <div className="mt-10">
          <FaqList faqs={faqs} />
        </div>
      </div>
    </section>
  );
}
