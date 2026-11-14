import { daysLeft, type GovBid } from "./bids";
import { TIERS, type Coverage, type Tier } from "./permit-score";

export interface ScoredBid {
  score: number;
  tier: Tier;
  why: string;
  parts: { label: string; points: number; max: number; reason: string }[];
  daysLeft: number | null;
  ageDays: number | null;
}

type Part = [points: number, reason: string];
const DAY = 86_400_000;

/** How recently it was posted, out of 25. */
const freshness = (age: number | null): Part => {
  if (age === null) return [3, "posting date unknown"];
  if (age <= 3) return [25, "just posted"];
  if (age <= 7) return [21, "posted this week"];
  if (age <= 14) return [15, "posted 2 weeks ago"];
  if (age <= 30) return [9, "posted this month"];
  return [3, "posted a while ago"];
};

/** Time left to answer, out of 20: enough time to prepare an offer is best, a deadline in a day or two is hard to meet. */
const timeLeft = (days: number | null): Part => {
  if (days === null) return [10, "no deadline listed"];
  if (days < 0) return [0, "closed"];
  if (days <= 2) return [2, "very little time left"];
  if (days <= 6) return [10, "about a week left"];
  if (days <= 45) return [20, "enough time to prepare an offer"];
  return [14, "plenty of time"];
};

/** Set-asides reserve the work for small businesses, which is who our local contractors are. Out of 20. */
const setAside = (b: Pick<GovBid, "set_aside" | "set_aside_code">): Part =>
  b.set_aside_code ? [20, `${b.set_aside ?? "set-aside"}`.replace(/^./, (c) => c.toLowerCase())] : [6, "open to every size of business"];

/** Where the work is, out of 20. */
const place = (b: Pick<GovBid, "city">, cover: Coverage): Part => {
  if (b.city && cover.cities.has(b.city.trim().toLowerCase())) return [20, "in a city we serve"];
  if (cover.stateCovered) return [8, "in Texas, outside our listed cities"];
  return [0, "outside our service area"];
};

/** The kind of notice, out of 15: an open solicitation can be answered now, a "sources sought" is an early look. */
const kind = (type: string): Part => {
  if (/combined|^solicitation$/i.test(type.trim())) return [15, "open solicitation"];
  if (/presolicitation/i.test(type)) return [11, "presolicitation, coming soon"];
  if (/sources sought|request for information/i.test(type)) return [8, "early notice"];
  return [4, "special notice"];
};

type Scorable = Pick<GovBid, "posted_at" | "response_due" | "set_aside" | "set_aside_code" | "city" | "notice_type">;

/** Scores one notice from 0 to 100: freshness (25), time left (20), small-business set-aside (20), place (20) and kind of notice (15). */
export function scoreBid(b: Scorable, cover: Coverage, now = Date.now()): ScoredBid {
  const age = b.posted_at ? Math.max(0, Math.floor((now - Date.parse(b.posted_at)) / DAY)) : null;
  const days = daysLeft(b.response_due, now);
  const raw = [freshness(age), timeLeft(days), setAside(b), place(b, cover), kind(b.notice_type)];
  const labels: [string, number][] = [["Freshness", 25], ["Time to respond", 20], ["Small-business set-aside", 20], ["Service area", 20], ["Kind of notice", 15]];
  const parts = raw.map(([points, reason], i) => ({ label: labels[i][0], max: labels[i][1], points, reason }));
  const score = Math.min(100, parts.reduce((s, p) => s + p.points, 0));
  const tier: Tier = score >= TIERS.hot.min ? "hot" : score >= TIERS.warm.min ? "warm" : "cold";
  const why = parts.map((p) => p.reason).join(", ");
  return { score, tier, why: `${why[0].toUpperCase()}${why.slice(1)}.`, parts, daysLeft: days, ageDays: age };
}
