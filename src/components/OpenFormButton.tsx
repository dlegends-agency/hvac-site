"use client";

import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import { openLeadForm } from "@/lib/lead-events";
import type { HvacIssue } from "@/config/services";

interface Props {
  children: ReactNode;
  issue?: HvacIssue;
  variant?: Parameters<typeof buttonClass>[0];
  className?: string;
  ariaLabel?: string;
}

/** Scrolls to the lead form, optionally preselecting an issue. */
export function OpenFormButton({ children, issue, variant = "primary", className = "", ariaLabel }: Props) {
  return (
    <button type="button" aria-label={ariaLabel} className={buttonClass(variant, className)} onClick={() => openLeadForm(issue)}>
      {children}
    </button>
  );
}
