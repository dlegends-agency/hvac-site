import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured } from "@/lib/supabase";
import { stepTitles } from "@/lib/lead-schema";
import { useLeadForm } from "./useLeadForm";
import { ContactStep, DetailsStep, IssueStep, LocationStep, ReviewStep } from "./LeadSteps";


interface Props {
  title?: string;
  description?: string;
  /** Recorded with the lead so future location pages can identify where it came from. */
  source?: string;
  id?: string;
}

export function LeadCaptureForm({
  title = "Tell Us About Your HVAC Problem",
  description = "Share a few details so we can understand your repair needs and service location.",
  source,
  id = "lead-form",
}: Props) {
  const { form, step, setStep, status, setStatus, next, back, submit } = useLeadForm(source);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const last = stepTitles.length - 1;
  const submitting = status === "submitting";

  // Move focus to the step heading when the step changes, for keyboard and screen reader users.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step, status]);

  const showForm = status === "idle" || status === "submitting" || status === "error";

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5 sm:p-8">
        <h2 id={`${id}-title`} className="text-2xl font-bold text-navy sm:text-3xl">{title}</h2>
        <p className="mt-2 text-slate-600">{description}</p>

        {showForm && (
          <>
            <ol className="mt-6 flex items-center gap-2" aria-label="Form progress">
              {stepTitles.map((t, i) => (
                <li key={t} className="flex flex-1 flex-col gap-1.5" aria-current={i === step ? "step" : undefined}>
                  <span className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-slate-200"}`} />
                  <span className={`hidden text-xs sm:block ${i === step ? "font-semibold text-navy" : "text-slate-500"}`}>{t}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm font-medium text-slate-600 sm:hidden">
              Step {step + 1} of {stepTitles.length}: {stepTitles[step]}
            </p>

            <form onSubmit={step === last ? submit : (e) => { e.preventDefault(); void next(); }} noValidate className="mt-6">
              <h3 ref={headingRef} tabIndex={-1} className="mb-4 text-lg font-semibold text-navy outline-none">
                {["Select your HVAC issue", "Service location", "Contact details", "Additional information", "Review and submit"][step]}
              </h3>

              {/* All steps stay mounted-in-state via RHF; only the active one renders. */}
              {step === 0 && <IssueStep form={form} />}
              {step === 1 && <LocationStep form={form} />}
              {step === 2 && <ContactStep form={form} />}
              {step === 3 && <DetailsStep form={form} />}
              {step === 4 && <ReviewStep form={form} goTo={setStep} devMode={!isSupabaseConfigured} />}

              <div role="alert" aria-live="assertive">
                {status === "error" && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Something went wrong and your request was not sent. Please try again in a moment. If it keeps happening, the service may be temporarily unavailable.
                  </p>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                {step > 0 ? (
                  <Button variant="secondary" onClick={back} disabled={submitting}>
                    <ArrowLeft className="size-4" aria-hidden /> Back
                  </Button>
                ) : <span />}
                {step < last ? (
                  <Button type="submit">Continue <ArrowRight className="size-4" aria-hidden /></Button>
                ) : (
                  <Button type="submit" disabled={submitting} aria-busy={submitting}>
                    {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {submitting ? "Submitting…" : "Submit Service Request"}
                  </Button>
                )}
              </div>
            </form>
          </>
        )}

        {status === "success" && (
          <div role="status" className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5">
            <h3 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold text-green-900 outline-none">
              <CheckCircle2 className="size-5" aria-hidden /> Your request was submitted
            </h3>
            <p className="mt-2 text-sm text-green-900">
              We&apos;ll review your details and help look for a suitable local contractor. We can&apos;t guarantee availability or a response time.
              If you smell gas or suspect carbon monoxide, leave the area and contact emergency services.
            </p>
          </div>
        )}

        {status === "not_configured" && (
          <div role="status" className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <h3 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold text-orange-900 outline-none">
              <TriangleAlert className="size-5" aria-hidden /> Request not sent — development mode
            </h3>
            <p className="mt-2 text-sm text-orange-900">
              This form is not connected to a backend yet, so your request was <strong>not</strong> sent to anyone. Your answers are valid and ready to send once lead delivery is configured.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => setStatus("idle")}>
              Back to my answers
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
