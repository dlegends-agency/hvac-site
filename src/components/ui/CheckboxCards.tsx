import { Check, type LucideIcon } from "lucide-react";

interface CheckboxCardsProps {
  legend: string;
  hint?: string;
  options: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
  name: string;
  columns?: string;
  icons?: Record<string, LucideIcon>;
}

/** Accessible multi-select: real checkboxes stay in the DOM (visually hidden) with the same card visuals as RadioCards. */
export function CheckboxCards({ legend, hint, options, value, onChange, error, name, columns = "sm:grid-cols-2", icons }: CheckboxCardsProps) {
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1 text-sm font-semibold text-navy">{legend}</legend>
      {hint && <p className="mb-2.5 text-sm text-slate-600">{hint}</p>}
      <div className={`grid gap-2.5 ${columns}`}>
        {options.map((option) => {
          const Icon = icons?.[option];
          return (
            <label key={option} className="group relative flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] font-medium text-navy shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md has-[:checked]:border-primary has-[:checked]:bg-blue-50/70 has-[:checked]:shadow-md has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/25">
              <input type="checkbox" name={name} value={option} checked={value.includes(option)} onChange={() => toggle(option)} className="sr-only" />
              {Icon && (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-colors duration-200 group-has-[:checked]:bg-primary group-has-[:checked]:text-white" aria-hidden>
                  <Icon className="size-[18px]" />
                </span>
              )}
              <span className="flex-1 leading-snug">{option}</span>
              <span className="grid size-5 shrink-0 place-items-center rounded-md border-2 border-slate-300 transition-colors duration-200 group-has-[:checked]:border-primary group-has-[:checked]:bg-primary" aria-hidden>
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
