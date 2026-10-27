import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "accent";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  accent: "bg-white text-primary hover:bg-blue-50",
  secondary: "border border-slate-300 bg-white text-navy hover:bg-slate-50",
  ghost: "text-primary hover:bg-blue-50",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
