import { Check, type LucideIcon } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

interface RadioCardsProps {
  legend: string;
  options: readonly string[];
  register: UseFormRegisterReturn;
  error?: string;
  name: string;
  columns?: string;
  /** "cards" shows icon rows with a check; "pills" shows a compact segmented control. */
  variant?: "cards" | "pills";
  icons?: Record<string, LucideIcon>;
  /** Options that use the orange emergency accent when selected (pills only). */
  urgent?: readonly string[];
}

/** Accessible radio group: real radio inputs stay in the DOM (visually hidden) with custom visuals on top. */
export function RadioCards({ legend, options, register, error, name, columns = "sm:grid-cols-2", variant = "cards", icons, urgent = [] }: RadioCardsProps) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2.5 text-sm font-semibold text-navy">{legend}</legend>
      <div className={`grid gap-2.5 ${columns}`}>
        {options.map((option) => {
          const Icon = icons?.[option];
          if (variant === "pills") {
            const hot = urgent.includes(option);
            return (
              <label key={option} className={`group flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-semibold text-navy shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/25 ${hot ? "has-[:checked]:border-emergency has-[:checked]:bg-emergency has-[:checked]:text-white" : "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white"} has-[:checked]:shadow-lg`}>
                <input type="radio" value={option} className="sr-only" {...register} />
                {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                <span>{option}</span>
              </label>
            );
          }
          return (
            <label key={option} className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] font-medium text-navy shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md has-[:checked]:border-primary has-[:checked]:bg-blue-50/70 has-[:checked]:shadow-md has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/25">
              <input type="radio" value={option} className="sr-only" {...register} />
              {Icon && (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors duration-200 group-has-[:checked]:bg-primary group-has-[:checked]:text-white" aria-hidden>
                  <Icon className="size-[18px]" />
                </span>
              )}
              <span className="flex-1 leading-snug">{option}</span>
              <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-slate-300 transition-colors duration-200 group-has-[:checked]:border-primary group-has-[:checked]:bg-primary" aria-hidden>
                <Check className="size-3 scale-0 text-white transition-transform duration-200 group-has-[:checked]:scale-100" strokeWidth={3.5} />
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${name}-error`} className="anim-fade-in mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
