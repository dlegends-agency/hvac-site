import type { PublicPermit } from "./permits";

export type Tier = "hot" | "warm" | "cold";

export interface Scored {
  score: number;
  tier: Tier;
  /** Plain reasons, like "fresh, high value, new system or replacement, in a city we serve". */
  why: string;
  ageDays: number | null;
}

/** Where we have contractors: the cities of published directory listings, and whether we have any in the state at all. */
export interface Coverage {
  cities: Set<string>;
  stateCovered: boolean;
}

export const TIERS: Record<Tier, { label: string; hint: string; min: number }> = {
  hot: { label: "Hot", hint: "call this week", min: 65 },
  warm: { label: "Warm", hint: "follow up", min: 35 },
  cold: { label: "Cold", hint: "skip", min: 0 },
};

const DAY = 86_400_000;

/** Whole days between the issue date and now (never negative), or null when the permit has no date. */
export function ageInDays(issuedOn: string | null, now = Date.now()): number | null {
  if (!issuedOn) return null;
  const t = Date.parse(`${issuedOn}T00:00:00Z`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}

type Part = [points: number, reason: string];

/** How fresh it is, out of 35. Fresh permits are the ones whose owners have not hired anyone yet. */
const freshness = (age: number | null): Part => {
  if (age === null) return [0, "no issue date"];
  if (age <= 3) return [35, "fresh"];
  if (age <= 7) return [30, "recent"];
  if (age <= 14) return [22, "issued 2 weeks ago"];
  if (age <= 30) return [14, "issued this month"];
  if (age <= 60) return [6, "getting old"];
  return [1, "old"];
};

/** The project value, out of 25. Most cities leave it blank on HVAC permits, so that scores 0 and the other parts carry the rank. */
const valuePoints = (v: number | null): Part => {
  if (v === null || !Number.isFinite(v)) return [0, "no value listed"];
  if (v >= 100_000) return [25, "very high value"];
  if (v >= 25_000) return [22, "high value"];
  if (v >= 10_000) return [18, "good value"];
  if (v >= 5_000) return [13, "typical value"];
  if (v >= 1_000) return [8, "low value"];
  return [3, "very low value"];
};

const REPLACE = /replac|change[- ]?out|new (system|unit|hvac|install)|install|conversion|new construction|retrofit|upgrade/i;
const REPAIR = /repair|service|maintenance|fix|tune/i;
const BIG_JOB = /\b\d+\s*(units?|tons?)\b|complete|multi-?family|building|bldg|new construction|central heat|chiller|rooftop/i;

/** The kind and size of the job, out of 20: new system or replacement over repair, commercial over residential, bigger over smaller. */
const jobPoints = (p: Pick<PublicPermit, "description" | "permit_type" | "property_class">): Part => {
  const text = `${p.description ?? ""} ${p.permit_type ?? ""}`;
  let points = REPLACE.test(text) ? 10 : REPAIR.test(text) ? 5 : 6;
  const reasons = [REPLACE.test(text) ? "new system or replacement" : REPAIR.test(text) ? "repair job" : "HVAC work"];
  if (p.property_class === "commercial") {
    points += 6;
    reasons.push("commercial");
  }
  if (BIG_JOB.test(text)) {
    points += 4;
    reasons.push("big job");
  }
  return [Math.min(20, points), reasons.join(", ")];
};

/** Whether we have contractors there, out of 20. */
const areaPoints = (city: string, cover: Coverage): Part => {
  if (cover.cities.has(city.trim().toLowerCase())) return [20, "in a city we serve"];
  if (cover.stateCovered) return [8, "in Texas, outside our listed cities"];
  return [0, "outside our service area"];
};

type Scorable = Pick<PublicPermit, "issued_on" | "value_usd" | "city" | "description" | "permit_type" | "property_class">;

/** Scores one HVAC permit from 0 to 100: freshness (35), project value (25), job type and size (20) and whether we serve the city (20). */
export function scorePermit(p: Scorable, cover: Coverage, now = Date.now()): Scored {
  const age = ageInDays(p.issued_on, now);
  const parts = [freshness(age), valuePoints(p.value_usd), jobPoints(p), areaPoints(p.city, cover)];
  const score = Math.min(100, parts.reduce((s, [n]) => s + n, 0));
  const tier: Tier = score >= TIERS.hot.min ? "hot" : score >= TIERS.warm.min ? "warm" : "cold";
  const why = parts.map(([, text]) => text).join(", ");
  return { score, tier, why: `${why[0].toUpperCase()}${why.slice(1)}.`, ageDays: age };
}

export const ageText = (age: number | null) => (age === null ? "no date" : age === 0 ? "issued today" : age === 1 ? "issued yesterday" : `issued ${age} days ago`);
