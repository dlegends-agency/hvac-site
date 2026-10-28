import { LeadCaptureForm } from "@/components/form/LeadCaptureForm";

/** Homepage wrapper; the form itself is layout-agnostic so location and service pages can reuse it. */
export function LeadSection() {
  return (
    <div className="bg-white py-14 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">Get started</p>
          <h2 id="lead-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Tell Us About Your HVAC Problem</h2>
          <p className="mt-3 max-w-md text-slate-600">Share a few details so we can understand your repair needs and service location.</p>
          <div className="relative mt-8 hidden overflow-hidden rounded-3xl shadow-lg shadow-slate-900/10 lg:block">
            <img src="/images/form-tech.jpg" alt="Technician repairing an outdoor air conditioning unit" width={940} height={468}
              loading="lazy" decoding="async" className="h-72 w-full object-cover" />
            <p className="absolute right-3 bottom-3 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-navy shadow-md">
              Independent local contractors,<br />where available
            </p>
          </div>
        </div>
        <LeadCaptureForm showHeader={false} labelledBy="lead-heading" />
      </div>
    </div>
  );
}
