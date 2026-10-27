import { ChevronDown } from "lucide-react";
import { faqs } from "@/config/faq";
import { SectionHeading } from "./SectionHeading";

/** Native <details> gives keyboard + screen reader accordion behavior with zero client JS. */
export function FAQAccordion() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading id="faq-title" title="Frequently Asked Questions" />
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details key={f.question} className="group rounded-xl border border-slate-200 bg-white shadow-sm open:border-primary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 font-semibold text-navy [&::-webkit-details-marker]:hidden">
                {f.question}
                <ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-5 pb-5 leading-relaxed text-slate-700">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
