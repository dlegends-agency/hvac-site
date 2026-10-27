import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema, stepFields, type LeadFormValues } from "@/lib/lead-schema";
import { defaultCountry } from "@/config/form";
import { submitLead } from "@/lib/submit-lead";
import { onPreselectIssue } from "@/lib/lead-events";

export type SubmitStatus = "idle" | "submitting" | "success" | "not_configured" | "error";

const defaults: Partial<LeadFormValues> = {
  country: defaultCountry,
  unit: "",
  description: "",
  preferredContactTime: "",
  referralAcknowledgment: false,
  marketingConsent: false,
};

/** All form state and submission logic. Presentation lives in the step components. */
export function useLeadForm(source = "homepage") {
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: defaults,
    mode: "onTouched",
  });
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const inFlight = useRef(false);
  const requestId = useRef<string>("");

  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, []);

  // Cards elsewhere on the page can preselect an issue.
  useEffect(
    () =>
      onPreselectIssue((issue) => {
        form.setValue("issue", issue, { shouldValidate: true });
        setStep(0);
        setStatus((s) => (s === "success" ? s : "idle"));
      }),
    [form],
  );

  const next = useCallback(async () => {
    const ok = await form.trigger(stepFields[step], { shouldFocus: true });
    if (ok) setStep((s) => Math.min(s + 1, stepFields.length - 1));
  }, [form, step]);

  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const onValid = useCallback(async (values: LeadFormValues) => {
    if (inFlight.current) return; // prevent duplicate submissions
    inFlight.current = true;
    setStatus("submitting");
    try {
      const result = await submitLead(values, requestId.current, source);
      setStatus(result === "ok" ? "success" : result === "not_configured" ? "not_configured" : "error");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [source]);

  const submit = useCallback((e?: React.BaseSyntheticEvent) => form.handleSubmit(onValid)(e), [form, onValid]);

  const reset = useCallback(() => {
    form.reset(defaults);
    requestId.current = crypto.randomUUID();
    setStep(0);
    setStatus("idle");
  }, [form]);

  return { form, step, setStep, status, setStatus, next, back, submit, reset };
}
