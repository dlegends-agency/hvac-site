import type { Listing, PlanId } from "@/lib/types";

/** The plan a listing is currently entitled to. A paid plan counts only until plan_until (when set). */
export function activePlan(l: Pick<Listing, "plan" | "plan_until">, now = Date.now()): PlanId {
  const plan = l.plan ?? "free";
  if (plan === "free") return "free";
  if (l.plan_until && new Date(l.plan_until).getTime() <= now) return "free";
  return plan;
}

export const isFeatured = (l: Pick<Listing, "plan" | "plan_until">) => activePlan(l) !== "free";

const rank: Record<PlanId, number> = { premium: 0, featured: 1, free: 2 };

/** Premium first, then Featured, then Basic. Stable: the incoming order is kept within each tier. */
export function sortByPlan<T extends Pick<Listing, "plan" | "plan_until">>(list: T[]): T[] {
  return list
    .map((item, i) => ({ item, i, r: rank[activePlan(item)] }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}
