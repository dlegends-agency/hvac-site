import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
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
  /** Set false when the page shows its own heading, and pass that heading id as labelledBy. */
  showHeader?: boolean;
  labelledBy?: string;
}

const stepHeadings = ["Select your HVAC issues", "Service location", "Contact details", "Additional information", "Review and submit"];

export function LeadCaptureForm({
  title = "Tell Us About Your HVAC Problem",
  description = "Share a few details so we can understand your repair needs and service location.",
  source,
  id = "lead-form",
  showHeader = true,
  labelledBy,
}: Props) {
  const { form, step, setStep, status, setStatus, next, back, submit } = useLeadForm(source);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seen = useRef({ step: 0, status: "idle" as string });
  const last = stepTitles.length - 1;
  const submitting = status === "submitting";

  // Move focus to the step heading when the step changes, for keyboard and screen reader users.
  useEffect(() => {
    if (seen.current.step === step && seen.current.status === status) return;
    seen.current = { step, status };
    headingRef.current?.focus();
  }, [step, status]);

  const showForm = status === "idle" || status === "submitting" || status === "error";

  return (
    <section id={id} aria-labelledby={showHeader ? `${id}-title` : labelledBy} className="scroll-mt-24">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-sky-400 to-primary" />
        {showHeader && (
          <div className="mb-6">
            <h2 id={`${id}-title`} className="text-2xl font-bold text-navy sm:text-3xl">{title}</h2>
            <p className="mt-2 text-slate-600">{description}</p>
          </div>
        )}

        {showForm && (
          <>
            <ol className="flex items-start" aria-label="Form progress">
              {stepTitles.map((t, i) => (
                <li key={t} className="relative flex flex-1 flex-col items-center text-center" aria-current={i === step ? "step" : undefined}>
                  {i > 0 && (
                    <span aria-hidden className="absolute top-4 right-1/2 h-0.5 w-full overflow-hidden bg-slate-200">
                      <span className={`block h-full origin-left bg-primary transition-transform duration-500 ease-out ${i <= step ? "scale-x-100" : "scale-x-0"}`} />
                    </span>
                  )}
                  <span className={`relative z-10 grid size-8 place-items-center rounded-full text-sm font-semibold transition-all duration-300 ${i < step ? "bg-primary text-white" : i === step ? "scale-110 bg-primary text-white ring-4 ring-primary/20" : "bg-slate-200 text-slate-600"}`}>
                    {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? "font-semibold text-navy" : "text-slate-500"}`}>{t}</span>
                  <span className="sr-only">{`${t}${i < step ? " (completed)" : i === step ? " (current step)" : ""}`}</span>
                </li>
              ))}
            </ol>

            <form onSubmit={step === last ? submit : (e) => { e.preventDefault(); void next(); }} noValidate className="mt-7">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <h3 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-navy outline-none">{stepHeadings[step]}</h3>
                <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-primary">Step {step + 1} of {stepTitles.length}</span>
              </div>

              {/* Re-keyed per step so each panel animates in. Answers persist in react-hook-form. */}
              <div key={step} className="anim-step">
                {step === 0 && <IssueStep form={form} />}
                {step === 1 && <LocationStep form={form} />}
                {step === 2 && <ContactStep form={form} />}
                {step === 3 && <DetailsStep form={form} />}
                {step === 4 && <ReviewStep form={form} goTo={setStep} devMode={!isSupabaseConfigured} />}
              </div>

              <div role="alert" aria-live="assertive">
                {status === "error" && (
                  <p className="anim-fade-in mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Something went wrong and your request was not sent. Please try again in a moment. If it keeps happening, the service may be temporarily unavailable.
                  </p>
                )}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {step > 0 ? (
                  <Button variant="secondary" onClick={back} disabled={submitting} className="!rounded-full">
                    <ArrowLeft className="size-4" aria-hidden /> Back
                  </Button>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="size-4 text-primary" aria-hidden /> Your details are only used to help with your request.</p>
                )}
                {step < last ? (
                  <Button type="submit" className="group !rounded-full px-8 shadow-lg shadow-blue-600/20">
                    Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Button>
                ) : (
                  <Button type="submit" disabled={submitting} aria-busy={submitting} className="!rounded-full px-8 shadow-lg shadow-blue-600/20">
                    {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {submitting ? "Submitting…" : "Submit Service Request"}
                  </Button>
                )}
              </div>
            </form>
          </>
        )}

        {status === "success" && (
          <div role="status" className="anim-step rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
            <span className="anim-pop mx-auto grid size-14 place-items-center rounded-full bg-green-600 text-white"><CheckCircle2 className="size-8" aria-hidden /></span>
            <h3 ref={headingRef} tabIndex={-1} className="mt-4 text-xl font-bold text-green-900 outline-none">Your request was submitted</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-green-900">
              We&apos;ll review your details and help look for a suitable local contractor. Up to three contractors that serve your area may contact you directly. We can&apos;t guarantee availability or a response time.
              If you smell gas or suspect carbon monoxide, leave the area and contact emergency services.
            </p>
          </div>
        )}

        {status === "not_configured" && (
          <div role="status" className="anim-step rounded-2xl border border-orange-200 bg-orange-50 p-6">
            <h3 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold text-orange-900 outline-none">
              <TriangleAlert className="size-5" aria-hidden /> Request not sent — development mode
            </h3>
            <p className="mt-2 text-sm text-orange-900">
              This form is not connected to a backend yet, so your request was <strong>not</strong> sent to anyone. Your answers are valid and ready to send once lead delivery is configured.
            </p>
            <Button variant="secondary" className="mt-4 !rounded-full" onClick={() => setStatus("idle")}>
              Back to my answers
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
