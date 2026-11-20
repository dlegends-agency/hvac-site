import type { PipelineRow, Stage } from "./useLeadHub";

export interface Receipt { kind: string; item_id: string; unlocked_at: string; unlock_cents: number | null; unlock_ref: string | null }
export interface Activity { created_at: string; type: string; body: string | null }
export interface Contact { name: string | null; company: string | null; position: string | null; phone: string | null; email: string | null; index: number; issue?: string }
export interface ThreadMessage { id: number; sender: "business" | "customer"; body: string; subject: string | null; created_at: string }

export const ACTIVITY_LABEL: Record<string, string> = { status: "Status", note: "Note", follow_up: "Follow-up", call: "Call", email: "Email", unlock: "Unlocked", converted: "Converted" };
export const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined });
export const money = (n: number | null) => (n === null ? "Not listed" : `$${Math.round(n).toLocaleString("en-US")}`);

/** The steps shown on a lead's progress bar. A bid has one more: it is submitted to the agency before it is accepted. */
export const stepsFor = (kind: PipelineRow["kind"]): { label: string; stages: Stage[] }[] => [
  { label: "New", stages: ["saved", "new"] },
  { label: "Contacted", stages: ["contacted", "follow_up"] },
  { label: "Interested", stages: ["interested"] },
  { label: "Quote sent", stages: ["quoted"] },
  ...(kind === "bid" ? [{ label: "Bid submitted", stages: ["submitted"] as Stage[] }] : []),
  { label: "Accepted", stages: ["won"] },
  { label: "Converted", stages: ["converted"] },
];

/** The first letters of a name, for the round badge on a lead. */
export const initials = (name: string | null | undefined) => (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
