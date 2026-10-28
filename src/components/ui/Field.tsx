import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  hint?: string;
  className?: string;
  children: (a11y: { "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

export const inputClass =
  "block w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-base text-navy placeholder:text-slate-400 shadow-sm transition duration-200 hover:border-slate-300 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/15 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50/40 aria-[invalid=true]:focus:ring-red-500/15";

/** Wraps a <select class={inputClass}> with a custom chevron. */
export function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative [&_select]:appearance-none [&_select]:pr-10">
      {children}
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
    </div>
  );
}

export function Field({ id, label, error, optional, hint, className, children }: FieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-navy">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-500">(optional)</span>}
      </label>
      {children({ "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="anim-fade-in mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
