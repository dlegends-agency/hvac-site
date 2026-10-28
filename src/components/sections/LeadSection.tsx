import { LeadCaptureForm } from "@/components/form/LeadCaptureForm";
import { reveal } from "@/lib/reveal";

/** Homepage wrapper; the form itself is layout-agnostic so location and service pages can reuse it. */
export function LeadSection() {
  return (
    <div className="bg-white py-14 sm:py-20">
      <div className="mx-auto grid max-w-site items-start gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-28" {...reveal()}>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">Get started</p>
          <h2 id="lead-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Tell Us About Your HVAC Problem</h2>
          <p className="mt-3 max-w-md text-slate-600">Share a few details so we can understand your repair needs and service location.</p>
          <div className="relative mt-10 hidden max-w-md lg:block">
            <div aria-hidden className="absolute -inset-3 -rotate-3 rounded-3xl bg-sky-100" />
            <img src="/images/form-tech.jpg" alt="Technician repairing an outdoor air conditioning unit" width={1000} height={667}
              loading="lazy" decoding="async" className="relative w-full rounded-2xl shadow-xl ring-8 ring-white" />
            <p className="absolute -right-4 -bottom-4 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-navy shadow-lg ring-1 ring-slate-100">
              Independent local contractors,<br />where available
            </p>
          </div>
        </div>
        <div {...reveal(1)}><LeadCaptureForm showHeader={false} labelledBy="lead-heading" /></div>
      </div>
    </div>
  );
}
