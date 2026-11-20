/** Bid Preparation: one workspace per government solicitation. See supabase/schema-bidprep.sql. */
export const BID_STATUSES = ["new", "under_review", "qualified", "preparing_bid", "internal_review", "approved", "submitted", "awarded", "lost", "expired"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  new: "New", under_review: "Under Review", qualified: "Qualified", preparing_bid: "Preparing Bid", internal_review: "Internal Review",
  approved: "Approved", submitted: "Submitted", awarded: "Awarded", lost: "Lost", expired: "Expired",
};
export const BID_STATUS_STYLE: Record<BidStatus, string> = {
  new: "bg-slate-100 text-slate-700", under_review: "bg-sky-100 text-sky-900", qualified: "bg-teal-100 text-teal-900", preparing_bid: "bg-blue-100 text-blue-900",
  internal_review: "bg-amber-100 text-amber-900", approved: "bg-green-100 text-green-900", submitted: "bg-violet-100 text-violet-900",
  awarded: "bg-emerald-100 text-emerald-900", lost: "bg-slate-200 text-slate-600", expired: "bg-red-100 text-red-800",
};
/** Statuses where the bid is still being worked and a deadline matters. */
export const isOpenBid = (s: BidStatus) => !["submitted", "awarded", "lost", "expired"].includes(s);

export const DOC_TYPES = ["RFP", "RFQ", "ITB", "Solicitation", "Specification", "Drawing", "Attachment", "Other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const REQ_CATEGORIES = ["qualification", "license", "insurance", "certification", "bonding", "attachment", "evaluation", "technical", "other"] as const;
export type ReqCategory = (typeof REQ_CATEGORIES)[number];
export const REQ_STATUSES = ["verified", "missing", "needs_update", "manual"] as const;
export type ReqStatus = (typeof REQ_STATUSES)[number];
export const REQ_STATUS_LABEL: Record<ReqStatus, string> = { verified: "Verified", missing: "Missing", needs_update: "Needs update", manual: "Needs manual check" };
export const REQ_GROUP_TITLE: Record<ReqStatus, string> = { verified: "Verified requirements", missing: "Missing requirements", needs_update: "Documents requiring updates", manual: "Requirements needing manual verification" };
export const REQ_STATUS_STYLE: Record<ReqStatus, string> = { verified: "bg-green-100 text-green-900", missing: "bg-red-100 text-red-800", needs_update: "bg-amber-100 text-amber-900", manual: "bg-slate-100 text-slate-700" };

export interface BidAnalysis {
  contract_title?: string; agency?: string; scope_of_work?: string; submission_deadline?: string;
  project_requirements?: string[]; mandatory_qualifications?: string[]; required_licenses?: string[]; insurance?: string[];
  certifications?: string[]; bonding?: string[]; required_attachments?: string[]; evaluation_criteria?: string[];
}

export interface BidWorkspace {
  id: string; listing_id: string; gov_bid_id: string | null; title: string; agency: string | null; solicitation_number: string | null; location: string | null;
  source: string | null; contract_value: number | null; due_at: string | null; status: BidStatus; analysis: BidAnalysis | null; analyzed_at: string | null;
  notes: string | null; created_at: string; updated_at: string;
}
export interface BidDocument { id: string; workspace_id: string; name: string; doc_type: DocType; url: string | null; extracted_text: string | null; created_at: string }
export interface BidRequirement { id: string; workspace_id: string; category: ReqCategory; text: string; mandatory: boolean; status: ReqStatus; evidence: string | null; source: "ai" | "manual"; created_at: string }
export interface BidEstimateLine { id: string; workspace_id: string; kind: "labor" | "material" | "equipment" | "other"; description: string; quantity: number; unit: string | null; unit_cost: number; created_at: string }
export interface ProposalSection { title: string; body: string }
export interface BidProposal { id: string; workspace_id: string; version: number; title: string; sections: ProposalSection[]; status: "draft" | "internal_review" | "approved"; by_ai: boolean; review_notes: string | null; approved_at: string | null; created_at: string; updated_at: string }
export interface BidActivity { id: number; workspace_id: string; type: string; body: string | null; created_at: string }

/** Whole days until the deadline (negative once it has passed), or null when there is none. */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.ceil((t - now) / 86_400_000) : null;
}
export const dueLabel = (d: number | null) => (d === null ? "No deadline" : d < 0 ? `Closed ${-d} d ago` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`);
