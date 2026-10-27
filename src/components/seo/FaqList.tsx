import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/config/faq";

/** Native <details> accordion: keyboard accessible, works without client JS, content stays in the HTML for crawlers. */
export function FaqList({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="space-y-3">
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
  );
}
