/** An open federal contract notice from SAM.gov for HVAC work in Texas (see scripts/bids). */
export interface GovBid {
  id: string;
  imported_at: string;
  notice_id: string;
  title: string;
  solicitation_number: string | null;
  agency: string | null;
  department: string | null;
  office: string | null;
  notice_type: string;
  posted_at: string | null;
  response_due: string | null;
  set_aside: string | null;
  set_aside_code: string | null;
  naics: string | null;
  psc: string | null;
  relevance: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  address: string | null;
  contacts: BidContact[];
  description: string | null;
  sam_url: string | null;
  info_url: string | null;
  summary: string;
}

export interface BidContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
}

const DAY = 86_400_000;

/** Whole days from now until the deadline (negative when it has passed), or null when there is none. */
export function daysLeft(due: string | null, now = Date.now()): number | null {
  if (!due) return null;
  const t = Date.parse(due);
  return Number.isFinite(t) ? Math.ceil((t - now) / DAY) : null;
}

export const dueText = (days: number | null) =>
  days === null ? "no deadline listed" : days < 0 ? "closed" : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`;

/** A short card heading: the notice title without the codes some agencies put in front, in normal capitals. */
export function bidTitle(b: Pick<GovBid, "title">): string {
  let t = b.title.replace(/\s+/g, " ").replace(/^(?:[A-Z0-9]{2,6}\s*(?:--|\|)\s*)+/, "").trim();
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
  return t.length > 90 ? `${t.slice(0, 90).replace(/\s+\S*$/, "")}…` : t;
}
