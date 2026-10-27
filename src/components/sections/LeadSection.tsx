import { LeadCaptureForm } from "@/components/form/LeadCaptureForm";

/** Homepage wrapper; the form itself is layout-agnostic so location pages can reuse it. */
export function LeadSection() {
  return (
    <div className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <LeadCaptureForm />
      </div>
    </div>
  );
}
