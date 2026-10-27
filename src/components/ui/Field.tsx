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
  "block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-navy placeholder:text-slate-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 aria-[invalid=true]:border-red-600";

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
        <p id={`${id}-hint`} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
