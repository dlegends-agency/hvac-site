import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scoreBid } from "@/lib/bid-score";
import { bidTitle, type GovBid } from "@/lib/bids";
import { scorePermit, type Coverage, type Tier } from "@/lib/permit-score";
import type { PublicPermit } from "@/lib/permits";
import { coverageForListing, useOpportunities } from "@/lib/use-opportunities";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { ContractorLead, Listing, PlanId } from "@/lib/types";
import { unlockCost } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { useMyLeads } from "./useMyLeads";

export type LeadKind = "lead" | "permit" | "bid";

export const KIND_LABEL: Record<LeadKind, string> = { lead: "Customer request", permit: "Building permit", bid: "Government bid" };
export const KIND_PLURAL: Record<LeadKind, string> = { lead: "Customer requests", permit: "Building permits", bid: "Government bids" };
/** Chip colours, one per kind, so the three lead types are told apart at a glance. */
export const KIND_STYLE: Record<LeadKind, string> = {
  lead: "bg-blue-50 text-blue-800 ring-blue-200",
  permit: "bg-amber-50 text-amber-900 ring-amber-200",
  bid: "bg-violet-50 text-violet-800 ring-violet-200",
};

/** The steps a lead moves through. Bids add "submitted". "saved" and "new" are the same first step; "converted" is set when the lead becomes a project. */
export const STAGES = ["saved", "new", "contacted", "follow_up", "interested", "quoted", "submitted", "won", "converted", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  saved: "New", new: "New", contacted: "Contacted", follow_up: "Follow-up", interested: "Interested", quoted: "Quote sent",
  submitted: "Bid submitted", won: "Accepted", converted: "Converted", lost: "Lost",
};
export const STAGE_STYLE: Record<Stage, string> = {
  saved: "bg-slate-100 text-slate-700",
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-amber-100 text-amber-900",
  follow_up: "bg-orange-100 text-orange-900",
  interested: "bg-sky-100 text-sky-900",
  quoted: "bg-blue-100 text-blue-900",
  submitted: "bg-violet-100 text-violet-900",
  won: "bg-green-100 text-green-900",
  converted: "bg-emerald-100 text-emerald-900",
  lost: "bg-slate-200 text-slate-600",
};
/** The stages a person can pick by hand. "Converted" is set only by converting the lead to a project. */
export const stagesFor = (kind: LeadKind): Stage[] => STAGES.filter((s) => s !== "new" && s !== "converted" && (kind === "bid" || s !== "submitted"));

export interface PipelineRow {
  listing_id: string;
  kind: LeadKind;
  item_id: string;
  stage: Stage;
  title: string;
  place: string | null;
  note: string | null;
  amount_usd: number | null;
  due_on: string | null;
  follow_up_on: string | null;
  created_at: string;
  updated_at: string;
}

/** One lead of any kind, in the shape the Leads page lists. */
export interface HubItem {
  key: string;
  kind: LeadKind;
  id: string;
  title: string;
  /** The line under the title: who or where. */
  place: string;
  /** When it arrived or was issued (ISO date), for sorting and "3 days ago". */
  when: string | null;
  /** A short fact to compare leads by: the project value, the response deadline or how soon the customer needs help. */
  fact: string | null;
  unlocked: boolean;
  /** Dollars to unlock on this business's plan (0 on Premium or once unlocked). */
  price: number;
  tier: Tier | null;
  score: number;
  urgent: boolean;
  city: string | null;
  /** The person, project or agency the opportunity is about. */
  subject: string;
  /** What the work is, in a sentence or two. */
  blurb: string;
  industry: string;
  trade: string;
  /** Estimated project value in dollars, when the source states one. */
  value: number | null;
  /** Where we found it. */
  source: string;
}

const money = (n: number | null) => (n === null || !Number.isFinite(Number(n)) ? null : `$${Math.round(Number(n)).toLocaleString("en-US")} project`);
const shortDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null);

export function leadItem(l: ContractorLead, plan: PlanId): HubItem {
  const urgent = l.urgency === "Immediately";
  return {
    key: `lead:${l.id}`, kind: "lead", id: l.id,
    title: `${[l.first_name, l.last_name].filter(Boolean).join(" ")}: ${l.issue}`,
    place: [l.city, l.state].filter(Boolean).join(", "),
    when: l.assigned_at,
    fact: l.urgency ? (urgent ? "Needs help now" : l.urgency) : null,
    unlocked: l.unlocked, price: l.unlocked ? 0 : unlockCost(plan, "lead"), tier: urgent ? "hot" : null, score: urgent ? 95 : 55, urgent, city: l.city,
    subject: [l.first_name, l.last_name].filter(Boolean).join(" ") || "Customer request", blurb: l.issue, industry: "Residential and light commercial HVAC", trade: "HVAC repair and installation", value: null, source: "HVACHelp customer request",
  };
}

export function permitItem(p: PublicPermit, cover: Coverage, plan: PlanId): HubItem {
  const s = scorePermit(p, cover);
  return {
    key: `permit:${p.id}`, kind: "permit", id: p.id,
    title: p.summary || "HVAC building permit",
    place: [p.city, "TX"].filter(Boolean).join(", "),
    when: p.issued_on ?? p.imported_at,
    fact: money(p.value_usd) ?? (p.property_class === "unknown" ? null : p.property_class),
    unlocked: p.unlocked !== false, price: p.unlocked === false ? unlockCost(plan, "permit") : 0, tier: s.tier, score: s.score, urgent: false, city: p.city,
    subject: p.summary || "HVAC building permit", blurb: [p.permit_type, p.property_class === "unknown" ? null : `${p.property_class} property`].filter(Boolean).join(" · "),
    industry: p.property_class === "unknown" ? "Construction" : p.property_class === "commercial" ? "Commercial construction" : "Residential construction", trade: p.trade || "HVAC",
    value: p.value_usd !== null && Number.isFinite(Number(p.value_usd)) ? Number(p.value_usd) : null, source: "City building permit",
  };
}

export function bidItem(b: GovBid, cover: Coverage, plan: PlanId): HubItem {
  const s = scoreBid(b, cover);
  return {
    key: `bid:${b.id}`, kind: "bid", id: b.id,
    title: bidTitle(b),
    place: [b.agency, [b.city, b.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
    when: b.posted_at,
    fact: b.response_due ? `Due ${shortDay(b.response_due)}` : null,
    unlocked: b.unlocked !== false, price: b.unlocked === false ? unlockCost(plan, "bid") : 0, tier: s.tier, score: s.score, urgent: s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 6, city: b.city,
    subject: bidTitle(b), blurb: b.summary || "", industry: "Government contract", trade: "HVAC", value: null, source: "Federal contract notice",
  };
}

/** Everything the contractor can act on, from all three sources, plus their own saved list (lead_pipeline). */
export function useLeadHub(listing: Listing | null) {
  const enabled = Boolean(listing);
  const plan: PlanId = listing ? activePlan(listing) : "free";
  const mine = useMyLeads(enabled);
  const opps = useOpportunities(enabled);
  const cover = useMemo(() => coverageForListing(listing), [listing]);
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [pipelineError, setPipelineError] = useState(false);
  const [pipelineLoaded, setPipelineLoaded] = useState(false);
  const { reload: reloadLeads } = mine;
  const { reload: reloadOpps } = opps;

  const loadPipeline = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser().from("lead_pipeline").select("*").order("updated_at", { ascending: false }).limit(2000);
    setPipelineError(Boolean(error));
    setPipelineLoaded(true);
    setPipeline((data as PipelineRow[] | null) ?? []);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadPipeline();
  }, [enabled, loadPipeline]);

  const items = useMemo<HubItem[]>(() => [
    ...(mine.leads ?? []).map((l) => leadItem(l, plan)),
    ...opps.permits.map((p) => permitItem(p, cover, plan)),
    ...opps.bids.map((b) => bidItem(b, cover, plan)),
  ], [mine.leads, opps.permits, opps.bids, cover, plan]);

  const reloadAll = useCallback(() => {
    void reloadLeads();
    reloadOpps();
    void loadPipeline();
  }, [reloadLeads, reloadOpps, loadPipeline]);

  /** Put leads on My Leads (the saved list). A lead that is already there is left alone. */
  const save = useCallback(async (chosen: HubItem[]) => {
    if (!listing || chosen.length === 0) return { ok: true as const };
    const rows = chosen.map((i) => ({ listing_id: listing.id, kind: i.kind, item_id: i.id, title: i.title.slice(0, 300), place: i.place.slice(0, 200) || null }));
    const { error } = await getSupabaseBrowser().from("lead_pipeline").upsert(rows, { onConflict: "listing_id,kind,item_id", ignoreDuplicates: true });
    if (error) return { ok: false as const, error: error.message };
    await loadPipeline();
    return { ok: true as const };
  }, [listing, loadPipeline]);

  // A lead that has been paid for goes to My Leads by itself. (On Premium everything is unlocked, so only leads you save are listed.)
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!listing || !pipelineLoaded || pipelineError || plan === "premium" || mine.leads === null || opps.loading) return;
    const have = new Set(pipeline.map((r) => `${r.kind}:${r.item_id}`));
    const missing = items.filter((i) => i.unlocked && !have.has(i.key) && !tried.current.has(i.key));
    if (missing.length === 0) return;
    for (const i of missing) tried.current.add(i.key);
    void save(missing);
  }, [listing, pipelineLoaded, pipelineError, plan, mine.leads, opps.loading, items, pipeline, save]);

  const update = useCallback(async (row: Pick<PipelineRow, "kind" | "item_id">, patch: Partial<Pick<PipelineRow, "stage" | "note" | "amount_usd" | "due_on" | "follow_up_on">>) => {
    if (!listing) return false;
    const { error } = await getSupabaseBrowser().from("lead_pipeline").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("listing_id", listing.id).eq("kind", row.kind).eq("item_id", row.item_id);
    if (!error) await loadPipeline();
    return !error;
  }, [listing, loadPipeline]);

  const remove = useCallback(async (row: Pick<PipelineRow, "kind" | "item_id">) => {
    if (!listing) return false;
    const { error } = await getSupabaseBrowser().from("lead_pipeline").delete().eq("listing_id", listing.id).eq("kind", row.kind).eq("item_id", row.item_id);
    if (!error) await loadPipeline();
    return !error;
  }, [listing, loadPipeline]);

  return {
    plan, items, cover, pipeline, pipelineError, save, update, remove, reloadAll,
    leads: mine.leads, replaceLead: mine.replace,
    permits: opps.permits, bids: opps.bids,
    loading: mine.leads === null || opps.loading,
    error: mine.error || opps.error,
  };
}
