import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { useLiveQuery } from "@/lib/admin-hooks";
import { eventInfo } from "@/lib/flow";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Panel } from "./widgets";

interface Basics { status: string; city: string; state: string; postal_code: string | null; email: string | null; phone: string | null; service_areas: string | null; unclaimed?: boolean; created_at?: string; source?: string | null; vendor_synced_at?: string | null }
interface Entry { at: string; tone: "ok" | "warn" | "bad" | "info"; title: string; detail?: string; link?: string }
interface Data { owner: string | null; claims: { created_at: string; status: string; contact_name: string }[]; events: { id: number; created_at: string; kind: string; detail: string | null; lead_id: string }[]; assignments: { lead_id: string; assigned_at: string; contacted_at: string | null; unlocked_at: string | null; contractor_status: string; source: string }[]; matches: { id: string; created_at: string; score: number; gov_bids: { title: string; city: string | null } | null; public_permits: { summary: string; city: string } | null }[]; vendors: number; emails: { id: number; created_at: string; kind: string; subject: string; error: string | null }[]; digests: { id: string; sent_at: string | null; permits: number; bids: number }[]; permitsNearby: number; bidsNearby: number }

const dot = { ok: "bg-green-500", warn: "bg-amber-500", bad: "bg-red-500", info: "bg-primary" } as const;
const when = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Admin > Directory > one listing: why this business is or is not getting leads, and a timeline of everything that happened to it:
 * when it was added, vendor matches, claims, leads routed to it, opportunity emails and the leads that did not reach it.
 */
export function ListingTimeline({ listingId, listing }: { listingId: string; listing: Basics }) {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<Data | null>(null, async () => {
    const ok = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<T> => { try { const r = await p; return r.error ? fallback : (r.data ?? fallback); } catch { return fallback; } };
    const city = listing.city.replace(/[%_,]/g, " ").trim();
    const [owner, claims, events, assignments, vendorRows, emails, digests, permits, bids] = await Promise.all([
      ok(supabase.from("listing_owners").select("created_at").eq("listing_id", listingId).maybeSingle(), null as { created_at: string } | null),
      ok(supabase.from("listing_claims").select("created_at,status,contact_name").eq("listing_id", listingId).order("created_at"), [] as Data["claims"]),
      ok(supabase.from("lead_events").select("id,created_at,kind,detail,lead_id").eq("listing_id", listingId).order("id", { ascending: false }).limit(100), [] as Data["events"]),
      ok(supabase.from("lead_assignments").select("lead_id,assigned_at,contacted_at,unlocked_at,contractor_status,source").eq("listing_id", listingId).order("assigned_at", { ascending: false }).limit(100), [] as Data["assignments"]),
      ok(supabase.from("gov_vendors").select("id").eq("listing_id", listingId), [] as { id: string }[]),
      ok(supabase.from("opportunity_emails").select("id,created_at,kind,subject,error").eq("listing_id", listingId).order("created_at", { ascending: false }).limit(50), [] as Data["emails"]),
      ok(supabase.from("opportunity_digests").select("id,sent_at,permits,bids").eq("listing_id", listingId).order("created_at", { ascending: false }).limit(20), [] as Data["digests"]),
      supabase.from("public_permits").select("id", { count: "exact", head: true }).ilike("city", city),
      supabase.from("gov_bids").select("id", { count: "exact", head: true }).ilike("city", city).ilike("state", listing.state.length === 2 ? listing.state : `${listing.state.slice(0, 2)}%`),
    ]);
    const ids = vendorRows.map((v) => v.id);
    const matches = ids.length
      ? ((await ok(supabase.from("vendor_matches").select("id,created_at,score,gov_bids(title,city),public_permits(summary,city)").in("vendor_id", ids).order("score", { ascending: false }).limit(100), [] as unknown[])) as Data["matches"])
      : [];
    return { data: { owner: owner?.created_at ?? null, claims, events, assignments, matches, vendors: ids.length, emails, digests, permitsNearby: permits.count ?? 0, bidsNearby: bids.count ?? 0 }, error: null };
  }, { key: `listing-timeline-${listingId}`, intervalMs: 60_000 });

  const d = q.data;
  const checks = useMemo(() => {
    if (!d) return [];
    const list: { ok: boolean; text: string; fix?: string }[] = [];
    list.push({ ok: listing.status === "published", text: listing.status === "published" ? "Published" : `Status is "${listing.status}"`, fix: "Only published listings are sent leads." });
    list.push({ ok: true, text: d.owner ? "Claimed: a business owner is linked" : "Not claimed yet: matches are held for the owner", fix: "Leads, permits and bids are matched to this listing anyway. Alerts and unlocking start once a claim is approved under Directory > Claims." });
    list.push({ ok: Boolean(listing.city && listing.state), text: listing.city && listing.state ? `Service location: ${listing.city}, ${listing.state}` : "No city or state", fix: "A lead matches when its city is this city or in the service areas, or within the service radius of the ZIP code." });
    list.push({ ok: Boolean(listing.postal_code), text: listing.postal_code ? `ZIP code ${listing.postal_code} (enables the service radius)` : "No ZIP code", fix: "Without a ZIP code only an exact city or service-area name can match, not the radius." });
    list.push({ ok: Boolean(listing.email), text: listing.email ? "Has an email for lead alerts" : "No email on file", fix: "Lead and opportunity alerts are emailed to the owner; this listing has no email to fall back on." });
    return list;
  }, [d, listing]);

  const entries = useMemo<Entry[]>(() => {
    if (!d) return [];
    const out: Entry[] = [];
    if (listing.created_at) out.push({ at: listing.created_at, tone: "info", title: "Listing added", detail: listing.source ? `Source: ${listing.source}${listing.unclaimed ? " (unclaimed)" : ""}` : undefined });
    if (listing.vendor_synced_at) out.push({ at: listing.vendor_synced_at, tone: "info", title: "Details refreshed from the government vendor file" });
    for (const c of d.claims) out.push({ at: c.created_at, tone: c.status === "approved" ? "ok" : c.status === "rejected" ? "bad" : "warn", title: `Claim ${c.status}`, detail: `Filed by ${c.contact_name}` });
    if (d.owner) out.push({ at: d.owner, tone: "ok", title: "Owner linked: this business can now receive leads" });
    for (const m of d.matches) out.push({ at: m.created_at, tone: "ok", title: m.gov_bids ? `Vendor matched to a bid (score ${m.score})` : `Vendor matched to a permit (score ${m.score})`, detail: m.gov_bids ? `${m.gov_bids.title}${m.gov_bids.city ? `, ${m.gov_bids.city}` : ""}` : `${m.public_permits?.summary ?? ""}` });
    for (const a of d.assignments) {
      out.push({ at: a.assigned_at, tone: "ok", title: a.source === "manual" ? "Lead assigned by an admin" : "Lead routed to this business", link: `/admin/leads/${a.lead_id}` });
      if (a.unlocked_at) out.push({ at: a.unlocked_at, tone: "ok", title: "Business unlocked the lead", link: `/admin/leads/${a.lead_id}` });
      if (a.contacted_at) out.push({ at: a.contacted_at, tone: "ok", title: "Business contacted the customer", link: `/admin/leads/${a.lead_id}` });
    }
    const assigned = new Set(d.assignments.map((a) => a.lead_id));
    for (const e of d.events) {
      if (e.kind === "assigned" && assigned.has(e.lead_id)) continue; // already shown as "routed"
      const info = eventInfo(e.kind);
      out.push({ at: e.created_at, tone: e.kind === "alert_failed" || e.kind === "unassigned" ? "bad" : e.kind === "no_match" ? "warn" : "info", title: info.label, detail: e.detail ?? undefined, link: `/admin/leads/${e.lead_id}` });
    }
    for (const m of d.emails) out.push({ at: m.created_at, tone: m.error ? "bad" : "ok", title: m.error ? `Opportunity email failed (${m.kind})` : `Opportunity email sent (${m.kind})`, detail: m.error ?? m.subject });
    for (const g of d.digests) if (g.sent_at) out.push({ at: g.sent_at, tone: "ok", title: "Weekly summary emailed", detail: `${g.permits} permits, ${g.bids} bids` });
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [d, listing]);

  const receiving = checks.length > 0 && checks[0].ok && checks[1].ok && checks[2].ok;

  return (
    <Panel title="Lead matching and timeline">
      {!d ? <p className="text-sm text-slate-500">Loading...</p> : (
        <>
          <p className={`mb-3 rounded-xl p-3 text-sm font-semibold ${receiving ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}>
            {receiving ? "This business can receive leads, permits and bids in its area." : "This business cannot receive leads yet. See why below."}
          </p>
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.text} className="flex gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />}
                <span><span className="font-medium text-navy">{c.text}</span>{!c.ok && c.fix && <span className="block text-xs text-slate-600">{c.fix}</span>}</span>
              </li>
            ))}
            <li className="flex gap-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
              <span className="text-slate-700">{d.permitsNearby} permit{d.permitsNearby === 1 ? "" : "s"} and {d.bidsNearby} bid{d.bidsNearby === 1 ? "" : "s"} exist in {listing.city}.{d.vendors > 0 ? ` ${d.matches.length} vendor match${d.matches.length === 1 ? "" : "es"} on record.` : ""}</span>
            </li>
          </ul>

          <h3 className="mb-2 mt-5 text-sm font-bold text-navy">Timeline</h3>
          {entries.length === 0 ? <p className="text-sm text-slate-500">Nothing has happened to this listing yet.</p> : (
            <ol className="max-h-[28rem] space-y-3 overflow-y-auto border-l border-slate-200 pl-4">
              {entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="relative">
                  <span className={`absolute -left-[1.4rem] top-1 size-2.5 rounded-full ring-2 ring-white ${dot[e.tone]}`} aria-hidden />
                  <p className="text-sm font-medium text-navy">{e.link ? <Link to={e.link} className="hover:underline">{e.title}</Link> : e.title}</p>
                  <p className="text-xs text-slate-500">{when(e.at)}{e.detail ? ` · ${e.detail}` : ""}</p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Panel>
  );
}
