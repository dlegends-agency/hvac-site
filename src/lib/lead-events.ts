import type { HvacIssue } from "@/config/services";

export const LEAD_FORM_ID = "lead-form";
const PRESELECT_EVENT = "hvac:preselect-issue";

/** Scrolls to the lead form and (optionally) preselects an issue. Safe to call from any client component. */
export function openLeadForm(issue?: HvacIssue) {
  if (issue) {
    window.dispatchEvent(new CustomEvent<HvacIssue>(PRESELECT_EVENT, { detail: issue }));
  }
  const el = document.getElementById(LEAD_FORM_ID);
  if (!el) {
    // Not on the homepage: a full navigation to it is intended.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/#${LEAD_FORM_ID}`);
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#${LEAD_FORM_ID}`);
}

export function onPreselectIssue(handler: (issue: HvacIssue) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<HvacIssue>).detail);
  window.addEventListener(PRESELECT_EVENT, listener);
  return () => window.removeEventListener(PRESELECT_EVENT, listener);
}
