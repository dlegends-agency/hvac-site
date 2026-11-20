/** A job or contract a business has won. Made by converting an accepted lead (or by hand); see supabase/schema-projects.sql. */
export const PROJECT_STATUSES = ["evaluating", "preparing_proposal", "bid_submitted", "awarded", "in_progress", "completed", "lost_cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  evaluating: "Evaluating",
  preparing_proposal: "Preparing Proposal",
  bid_submitted: "Bid Submitted",
  awarded: "Awarded",
  in_progress: "In Progress",
  completed: "Completed",
  lost_cancelled: "Lost or Cancelled",
};
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, string> = {
  evaluating: "bg-slate-100 text-slate-700",
  preparing_proposal: "bg-sky-100 text-sky-900",
  bid_submitted: "bg-violet-100 text-violet-900",
  awarded: "bg-green-100 text-green-900",
  in_progress: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-900",
  lost_cancelled: "bg-slate-200 text-slate-600",
};

export interface Project {
  id: string;
  listing_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  client_name: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_email: string | null;
  location: string | null;
  industry: string | null;
  trade: string | null;
  scope: string | null;
  lead_kind: "lead" | "permit" | "bid" | null;
  lead_item_id: string | null;
  contract_value: number | null;
  start_on: string | null;
  expected_end_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectTask { id: string; project_id: string; title: string; assignee: string | null; due_on: string | null; done: boolean; created_at: string }
export interface ProjectDocument { id: string; project_id: string; name: string; url: string; category: string | null; created_at: string }
export interface ProjectMember { id: string; project_id: string; name: string; role: string | null; phone: string | null; email: string | null; created_at: string }
export interface ProjectExpense { id: string; project_id: string; description: string; amount_usd: number; spent_on: string; created_at: string }
export interface ProjectActivity { id: number; project_id: string; type: string; body: string | null; created_at: string }
export interface Quotation {
  id: string;
  project_id: string | null;
  title: string;
  amount_usd: number;
  status: "draft" | "sent" | "accepted" | "declined";
  notes: string | null;
  sent_on: string | null;
  accepted_on: string | null;
  created_at: string;
}

/** The active statuses: not finished and not lost. */
export const isActiveProject = (s: ProjectStatus) => s !== "completed" && s !== "lost_cancelled";

export const usd = (n: number | null | undefined) => (n === null || n === undefined ? "Not set" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
export const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not set");
