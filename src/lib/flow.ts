// The request flow log (lead_events): plain-English names for each step, shared by the admin, contractor and customer screens.

export type Tone = "ok" | "info" | "warn" | "bad";

export const ADMIN_EVENTS: Record<string, { label: string; tone: Tone }> = {
  received: { label: "Request received", tone: "info" },
  routed: { label: "Sent to businesses", tone: "ok" },
  no_match: { label: "No business matched", tone: "warn" },
  spam: { label: "Marked as spam", tone: "bad" },
  assigned: { label: "Assigned to a business", tone: "info" },
  unassigned: { label: "Removed from a business", tone: "warn" },
  alert_queued: { label: "Email alert queued", tone: "info" },
  alert_sent: { label: "Email alert sent", tone: "ok" },
  alert_failed: { label: "Email alert failed", tone: "bad" },
  unlocked: { label: "Business unlocked the details", tone: "ok" },
  contacted: { label: "Business marked it contacted", tone: "ok" },
  won: { label: "Business marked it won", tone: "ok" },
  lost: { label: "Business marked it lost", tone: "info" },
  reopened: { label: "Business reopened it", tone: "info" },
  lead_status: { label: "Status changed", tone: "info" },
};

/** The same steps from a business's point of view. */
export const CONTRACTOR_EVENTS: Record<string, string> = {
  received: "The request arrived",
  assigned: "Sent to you",
  alert_sent: "We emailed you an alert",
  unlocked: "You unlocked the details",
  contacted: "You marked it contacted",
  won: "You marked it won",
  lost: "You marked it lost",
  reopened: "You reopened it",
};

export const eventInfo = (kind: string) => ADMIN_EVENTS[kind] ?? { label: kind, tone: "info" as Tone };

/** Event kinds an admin should look at. */
export const PROBLEM_EVENTS = ["no_match", "alert_failed", "spam", "unassigned"];

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-green-100 text-green-800",
  info: "bg-slate-100 text-slate-700",
  warn: "bg-amber-100 text-amber-900",
  bad: "bg-red-100 text-red-800",
};

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** "3 h", "45 min", "2 days": a short span of time. */
export function shortHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "No data yet";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours % 1 === 0 ? hours : hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} days`;
}
