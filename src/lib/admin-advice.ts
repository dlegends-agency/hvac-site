/** What the admin should do next, worked out from the numbers on the Overview. Pure, so it is easy to test. */
export interface AdviceInput {
  now: number;
  /** Customer requests still in status "new". */
  newLeads: { created_at: string }[];
  newMessages: number;
  pendingListings: number;
  pendingClaims: number;
  /** When each lead source last imported (ISO) or null when never. */
  permitsAt: string | null;
  bidsAt: string | null;
  visitors: number;
  prevVisitors: number;
  requests: number;
  paying: number;
  /** Published listings that have no email address, so they cannot be sent leads by email. */
  publishedNoEmail: number;
  /** The most viewed listing that is not on a paid plan, if any had views. */
  topFree: { name: string; slug: string; views: number } | null;
  /** Requests with no business in their area. */
  unmatched: number;
  days: number;
}

export interface Advice {
  id: string;
  level: "urgent" | "suggest" | "info";
  title: string;
  detail: string;
  to?: string;
  cta?: string;
}

const HOUR = 3_600_000;
const ageText = (ms: number) => (ms < 48 * HOUR ? `${Math.round(ms / HOUR)} hours` : `${Math.round(ms / (24 * HOUR))} days`);

export function adviceFor(i: AdviceInput): Advice[] {
  const out: Advice[] = [];
  const stale = i.newLeads.filter((l) => i.now - Date.parse(l.created_at) > 2 * HOUR);
  if (stale.length > 0) {
    out.push({ id: "stale-leads", level: "urgent", title: `${stale.length} customer ${stale.length === 1 ? "request has" : "requests have"} waited over 2 hours`, detail: "Customers choose the first business that answers. Check that these were routed to a contractor, or reach out yourself.", to: "/admin/leads", cta: "Open leads" });
  }
  if (i.unmatched > 0) {
    out.push({ id: "unmatched", level: "urgent", title: `${i.unmatched} ${i.unmatched === 1 ? "request has" : "requests have"} no business in the area`, detail: "Nobody was sent these. Add or approve businesses near them, or widen a contractor's service area.", to: "/admin/leads", cta: "See requests" });
  }
  if (i.pendingListings > 0) {
    out.push({ id: "listings", level: "urgent", title: `${i.pendingListings} business ${i.pendingListings === 1 ? "registration is" : "registrations are"} waiting`, detail: "A contractor who just signed up cannot receive leads until you approve the listing.", to: "/admin/listings", cta: "Review" });
  }
  if (i.pendingClaims > 0) {
    out.push({ id: "claims", level: "urgent", title: `${i.pendingClaims} ownership ${i.pendingClaims === 1 ? "claim needs" : "claims need"} a decision`, detail: "Check the claimant against the business, then approve or decline.", to: "/admin/listings/claims", cta: "Review claims" });
  }
  if (i.newMessages > 0) {
    out.push({ id: "messages", level: "suggest", title: `${i.newMessages} unread contact ${i.newMessages === 1 ? "message" : "messages"}`, detail: "Replying within a day keeps businesses and customers confident in the site.", to: "/admin/messages", cta: "Read" });
  }
  for (const [label, at, to] of [["Building permits", i.permitsAt, "/admin/permits"], ["Government bids", i.bidsAt, "/admin/bids"]] as const) {
    if (!at) out.push({ id: `${to}-never`, level: "suggest", title: `${label} have never been imported`, detail: "Contractors pay to unlock these, so an empty source earns nothing. Run the import once.", to: "/admin/schedule", cta: "Open schedule" });
    else if (i.now - Date.parse(at) > 36 * HOUR) out.push({ id: `${to}-stale`, level: "urgent", title: `${label} were last imported ${ageText(i.now - Date.parse(at))} ago`, detail: "The daily import may have failed. Check the run history and run it now.", to: "/admin/schedule", cta: "Open schedule" });
  }
  if (i.prevVisitors >= 20 && i.visitors < i.prevVisitors * 0.8) {
    out.push({ id: "traffic-down", level: "suggest", title: `Visitors are down ${Math.round((1 - i.visitors / i.prevVisitors) * 100)}% on the period before`, detail: "Look at where traffic came from on the Analytics page, and whether a blog post or city page lost its ranking.", to: "/admin/analytics", cta: "See Analytics" });
  }
  if (i.visitors >= 100 && i.requests / i.visitors < 0.01) {
    out.push({ id: "conversion", level: "suggest", title: `Only ${(Math.round((i.requests / i.visitors) * 1000) / 10).toString()}% of visitors send a request`, detail: "Try a clearer headline on the home page, a shorter request form, or more phone and trust details near the button.", to: "/admin/analytics", cta: "See pages" });
  }
  if (i.publishedNoEmail > 0) {
    out.push({ id: "no-email", level: "suggest", title: `${i.publishedNoEmail} published ${i.publishedNoEmail === 1 ? "business has" : "businesses have"} no email`, detail: "Without an email they never get the new-lead alert. Fill it in from their website or ask them.", to: "/admin/listings", cta: "Open directory" });
  }
  if (i.paying === 0 && i.topFree) {
    out.push({ id: "upsell", level: "suggest", title: `${i.topFree.name} is your most viewed free listing`, detail: `${i.topFree.views} ${i.topFree.views === 1 ? "view" : "views"} in the last ${i.days} days. A business that gets visitors is the easiest one to offer the Featured plan.`, to: `/directory/${i.topFree.slug}`, cta: "Open listing" });
  } else if (i.paying > 0 && i.topFree && i.topFree.views >= 10) {
    out.push({ id: "upsell", level: "info", title: `Offer Featured to ${i.topFree.name}`, detail: `It had ${i.topFree.views} views in the last ${i.days} days without a paid plan.`, to: `/directory/${i.topFree.slug}`, cta: "Open listing" });
  }
  if (out.length === 0) out.push({ id: "clear", level: "info", title: "Nothing needs you right now", detail: "Requests are handled, sources are fresh and nothing is waiting for review." });
  const rank = { urgent: 0, suggest: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
