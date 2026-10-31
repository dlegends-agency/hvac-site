import type { Listing, PlanId } from "@/lib/types";

/** The plan a listing is currently entitled to. A paid plan counts only until plan_until (when set). */
export function activePlan(l: Pick<Listing, "plan" | "plan_until">, now = Date.now()): PlanId {
  const plan = l.plan ?? "free";
  if (plan === "free") return "free";
  if (l.plan_until && new Date(l.plan_until).getTime() <= now) return "free";
  return plan;
}

export const isFeatured = (l: Pick<Listing, "plan" | "plan_until">) => activePlan(l) !== "free";

const rank: Record<PlanId, number> = { featured: 0, free: 1 };

/** Paid (Featured) listings first, then free ones. Stable: the incoming order is kept within each group. */
export function sortByPlan<T extends Pick<Listing, "plan" | "plan_until">>(list: T[]): T[] {
  return list
    .map((item, i) => ({ item, i, r: rank[activePlan(item)] }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/**
 * What the public directory shows for a listing. A free (or lapsed) listing shows only its name, phone number and address:
 * About us, services, service areas, website, email and the Google connection are paid features and are left out.
 */
export function publicView(l: Listing): Listing {
  if (isFeatured(l)) return l;
  return { ...l, description: null, services: [], service_areas: null, emergency_service: false, website: null, email: null, google_place_id: null, google_reviews_url: null };
}
