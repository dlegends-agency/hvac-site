import type { UseFormRegisterReturn } from "react-hook-form";

interface RadioCardsProps {
  legend: string;
  options: readonly string[];
  register: UseFormRegisterReturn;
  error?: string;
  name: string;
  columns?: string;
}

/** Accessible radio group styled as selectable cards. */
export function RadioCards({ legend, options, register, error, name, columns = "sm:grid-cols-2" }: RadioCardsProps) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-sm font-semibold text-navy">{legend}</legend>
      <div className={`grid gap-2 ${columns}`}>
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-navy shadow-sm has-[:checked]:border-primary has-[:checked]:bg-blue-50 has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50"
          >
            <input type="radio" value={option} className="size-4 accent-primary" {...register} />
            <span>{option}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
