import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { scoreBid, type ScoredBid } from "@/lib/bid-score";
import { bidTitle, dueText, type GovBid } from "@/lib/bids";
import type { Coverage } from "@/lib/permit-score";
import { Fact, ScoreBars, SidePanel, TIER_STYLE, TierColumns, dayText, searchClass, selectClass } from "./shared";

interface Row extends ScoredBid {
  b: GovBid;
}

const shortType = (t: string) => t.replace(/combined synopsis\/solicitation/i, "Solicitation").replace(/presolicitation/i, "Presolicitation");
const postedText = (age: number | null) => (age === null ? "" : age === 0 ? "posted today" : age === 1 ? "posted yesterday" : `posted ${age} days ago`);

/** The small card: the notice, when it is due, and who it is for. Click it for everything. */
function Card({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { b } = row;
  const style = TIER_STYLE[row.tier];
  const urgent = row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 6;
  return (
    <button type="button" onClick={onOpen} className={`block w-full rounded-xl border border-slate-200 border-l-4 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow focus-visible:outline-2 focus-visible:outline-primary ${style.bar}`}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="line-clamp-2 font-semibold text-navy">{bidTitle(b)}</span>
          <span className={`block text-sm ${urgent ? "font-semibold text-red-600" : "text-slate-600"}`}>{dueText(row.daysLeft)} · {postedText(row.ageDays)}</span>
        </span>
        <span className={`text-2xl leading-none font-extrabold ${style.score}`} aria-label={`Score ${row.score}`}>{row.score}</span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{shortType(b.notice_type)}</span>
        {b.set_aside_code && <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800">Set-aside</span>}
        {b.city && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{b.city}</span>}
        {b.agency && <span className="truncate text-slate-500">{b.agency}</span>}
      </span>
    </button>
  );
}

function Detail({ row, onClose }: { row: Row; onClose: () => void }) {
  const { b } = row;
  const place = [b.address, b.city, b.state, b.zip].filter(Boolean).join(", ");
  return (
    <SidePanel label="Bid details" tier={row.tier} score={row.score} title={bidTitle(b)} subtitle={[b.agency, b.city && `${b.city}, ${b.state}`].filter(Boolean).join(" · ")} onClose={onClose}>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{b.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {b.sam_url && <a href={b.sam_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Open on SAM.gov <ExternalLink className="size-4" aria-hidden /></a>}
        {b.info_url && <a href={b.info_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50">More information <ExternalLink className="size-4" aria-hidden /></a>}
      </div>

      <h3 className="mt-6 text-sm font-bold text-navy">Why this score</h3>
      <ScoreBars parts={row.parts} />

      <h3 className="mt-6 text-sm font-bold text-navy">Notice</h3>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <Fact label="Notice type" value={b.notice_type} />
        <Fact label="Solicitation number" value={b.solicitation_number} />
        <Fact label="Posted" value={b.posted_at ? `${dayText(b.posted_at)} (${postedText(row.ageDays)})` : null} />
        <Fact label="Response due" value={b.response_due ? `${dayText(b.response_due)} (${dueText(row.daysLeft)})` : "No deadline listed"} />
        <Fact label="Set-aside" value={b.set_aside ?? "None: open to every size of business"} />
        <Fact label="NAICS code" value={b.naics} />
        <Fact label="Product or service code" value={b.psc} />
        <Fact label="Agency" value={[b.department, b.agency, b.office].filter((v, i, a) => v && a.indexOf(v) === i).join(" › ") || null} />
        <Fact label="Place of performance" value={place || null} />
        <Fact label="Counted as HVAC because" value={b.relevance} />
      </dl>

      <h3 className="mt-6 text-sm font-bold text-navy">Contracting contacts</h3>
      {b.contacts.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No contact is listed. Use the SAM.gov notice.</p>
      ) : (
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {b.contacts.map((c, i) => (
            <li key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-navy">{c.name ?? "Contact"}</p>
              {c.title && <p className="text-xs text-slate-500">{c.title}</p>}
              <dl className="mt-2 space-y-1 text-slate-700">
                <div className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{c.email ? <a href={`mailto:${c.email}`} className="break-all text-primary hover:underline">{c.email}</a> : <span className="text-slate-400">No email</span>}</dd></div>
                <div className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{c.phone ? <a href={`tel:${c.phone.replace(/\D/g, "")}`} className="text-primary hover:underline">{c.phone}</a> : <span className="text-slate-400">No phone</span>}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {b.description && <><h3 className="mt-6 text-sm font-bold text-navy">Description</h3><p className="mt-1 text-sm whitespace-pre-line text-slate-700">{b.description}</p></>}
      <p className="mt-4 text-xs text-slate-500">Federal notices come from SAM.gov, the government&apos;s contracting site, through its public daily file. Always read the full notice there: deadlines and requirements can change.</p>
    </SidePanel>
  );
}

interface Props {
  bids: GovBid[];
  error: boolean;
  cover: Coverage;
  startCity?: string;
  intro: ReactNode;
  emptyText: ReactNode;
}

/** Open federal HVAC notices ranked Hot, Warm and Cold, with filters and a detail panel. Used by the admin and by business owners. */
export function BidBoard({ bids, error, cover, startCity = "all", intro, emptyText }: Props) {
  const [city, setCity] = useState(startCity);
  const [setAside, setSetAside] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return bids
      .map((b) => ({ ...b, contacts: b.contacts ?? [] }))
      .filter((b) => (city === "all" || b.city === city) && (setAside === "all" || (setAside === "yes" ? Boolean(b.set_aside_code) : !b.set_aside_code))
        && (!term || `${b.title} ${b.agency ?? ""} ${b.solicitation_number ?? ""} ${b.city ?? ""} ${b.naics ?? ""}`.toLowerCase().includes(term)))
      .map((b) => ({ b, ...scoreBid(b, cover) }))
      .sort((a, c) => c.score - a.score || (c.b.posted_at ?? "").localeCompare(a.b.posted_at ?? ""));
  }, [bids, cover, city, setAside, q]);
  const cityList = [...new Set(bids.map((b) => b.city).filter((c): c is string => Boolean(c)))].sort();
  const latest = bids.reduce((m, b) => (b.imported_at > m ? b.imported_at : m), "");
  const open = openId ? rows.find((r) => r.b.id === openId) ?? null : null;

  return (
    <div className="w-full">
      <p className="mb-5 text-sm text-slate-600">{intro}</p>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-700">City
          <select value={city} onChange={(e) => setCity(e.target.value)} className={selectClass}>
            <option value="all">All cities</option>
            {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">Set-aside
          <select value={setAside} onChange={(e) => setSetAside(e.target.value)} className={selectClass}>
            <option value="all">All notices</option>
            <option value="yes">Reserved for small or special businesses</option>
            <option value="no">Open to everyone</option>
          </select>
        </label>
        <label className="sr-only" htmlFor="bid-q">Search bids</label>
        <input id="bid-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, agency, solicitation #" className={searchClass} />
        <span className="text-xs text-slate-500">{rows.length} {rows.length === 1 ? "bid" : "bids"}{latest ? ` · last scrape ${new Date(latest).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
      </div>

      {error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Bids could not be loaded. Run <code>supabase/schema-bids.sql</code> in the Supabase SQL Editor.</p>
      ) : bids.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">{emptyText}</p>
      ) : (
        <TierColumns rows={rows} itemKey={(r) => r.b.id} card={(r) => <Card row={r} onOpen={() => setOpenId(r.b.id)} />} />
      )}

      {open && <Detail row={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
