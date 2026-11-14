import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { ageText, scorePermit, type Coverage, type Scored } from "@/lib/permit-score";
import { PERMIT_CLASS_STYLE, matchDirectory, permitTitle, permitValue, type DirectoryBusiness, type PermitPerson, type PublicPermit } from "@/lib/permits";
import { Fact, ScoreBars, SidePanel, TIER_STYLE, TierColumns, dayText, searchClass, selectClass } from "./shared";

interface Row extends Scored {
  p: PublicPermit;
}

/** The small card: just enough to tell permits apart. Click it for everything. */
function Card({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { p } = row;
  const style = TIER_STYLE[row.tier];
  return (
    <button type="button" onClick={onOpen} className={`block w-full rounded-xl border border-slate-200 border-l-4 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow focus-visible:outline-2 focus-visible:outline-primary ${style.bar}`}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-navy">{permitTitle(p)}</span>
          <span className="block text-sm text-slate-600">{permitValue(p.value_usd)} · {ageText(row.ageDays)}</span>
        </span>
        <span className={`text-2xl leading-none font-extrabold ${style.score}`} aria-label={`Score ${row.score}`}>{row.score}</span>
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${PERMIT_CLASS_STYLE[p.property_class]}`}>{p.property_class}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{p.city}</span>
        {p.contractor_name && <span className="truncate text-slate-500">{p.contractor_name}</span>}
      </span>
    </button>
  );
}

function Person({ person, directory, adminLinks }: { person: PermitPerson; directory: DirectoryBusiness | null; adminLinks: boolean }) {
  const place = [person.city, person.state, person.zip].filter(Boolean).join(" ");
  const email = person.email ?? directory?.email ?? null;
  const site = person.website ?? directory?.website ?? null;
  return (
    <li className="rounded-xl border border-slate-200 p-3 text-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{person.role}</p>
      <p className="font-semibold text-navy">{person.company ?? person.name}</p>
      {person.company && person.name && <p className="text-slate-700">{person.name}</p>}
      <dl className="mt-2 space-y-1 text-slate-700">
        <div className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{person.phone ? <a href={`tel:${person.phone.replace(/\D/g, "")}`} className="text-primary hover:underline">{person.phone}</a> : <span className="text-slate-400">No phone listed</span>}</dd></div>
        <div className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{email ? <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a> : <span className="text-slate-400">No email found</span>}{!person.email && email && <span className="ml-1 text-xs text-slate-500">(from the directory)</span>}</dd></div>
        {site && <div className="flex items-start gap-2"><Globe className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd className="min-w-0 break-all"><a href={site} target="_blank" rel="noreferrer" className="text-primary hover:underline">{site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></dd></div>}
        <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{person.address || place ? <>{person.address}{person.address && place ? ", " : ""}{place}</> : <span className="text-slate-400">No address listed</span>}</dd></div>
      </dl>
      {adminLinks && directory && (
        <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">
          In your directory: <Link to={`/admin/listings/${directory.id}`} className="font-semibold underline">{directory.business_name}</Link>{directory.website ? " · has a website" : ""}
        </p>
      )}
    </li>
  );
}

function Detail({ row, directory, adminLinks, onClose }: { row: Row; directory: DirectoryBusiness[]; adminLinks: boolean; onClose: () => void }) {
  const { p } = row;
  return (
    <SidePanel label="Permit details" tier={row.tier} score={row.score} title={permitTitle(p)} subtitle={`${p.address ? `${p.address}, ` : ""}${p.city}${p.zip ? ` ${p.zip}` : ""}`} onClose={onClose}>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{p.summary}</p>

      <h3 className="mt-6 text-sm font-bold text-navy">Why this score</h3>
      <ScoreBars parts={row.parts} />

      <h3 className="mt-6 text-sm font-bold text-navy">Permit</h3>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <Fact label="Permit number" value={p.source_id} />
        <Fact label="Permit type" value={p.permit_type} />
        <Fact label="Issued" value={`${dayText(p.issued_on)} (${ageText(row.ageDays)})`} />
        <Fact label="Project value" value={permitValue(p.value_usd)} />
        <Fact label="Property" value={p.property_class[0].toUpperCase() + p.property_class.slice(1)} />
        <Fact label="Source" value={p.source === "austin" ? "City of Austin open data" : p.source === "dallas" ? "City of Dallas open data" : p.source} />
      </dl>
      {p.description && <><h3 className="mt-6 text-sm font-bold text-navy">Work described</h3><p className="mt-1 text-sm whitespace-pre-line text-slate-700">{p.description}</p></>}

      <h3 className="mt-6 text-sm font-bold text-navy">People details</h3>
      {p.people.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">{p.contractor_name ? `Contractor: ${p.contractor_name}. ` : ""}No other details were published for this permit. They are scraped again each morning.</p>
      ) : (
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {p.people.map((person, i) => <Person key={`${person.role}-${i}`} person={person} directory={matchDirectory(person, directory)} adminLinks={adminLinks} />)}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">
        The city&apos;s open data lists the contractor&apos;s company, contact, phone and a shortened address. The email comes from the contractor&apos;s own website (found by the daily scrape). The general contractor is only on the city&apos;s own People Details page
        {p.source_url ? <>, open it with <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">City record <ExternalLink className="size-3" aria-hidden /></a>.</> : "."}
        {" "}A website only counts when it shows the contractor&apos;s phone number. Some contractors publish no email, or block automated visits.
      </p>
    </SidePanel>
  );
}

interface Props {
  permits: PublicPermit[];
  /** The permits could not be loaded (for example the SQL has not been run). */
  error: boolean;
  cover: Coverage;
  /** Businesses in the directory, used to fill in a contractor's email and (for admins) link to the listing. */
  directory?: DirectoryBusiness[];
  adminLinks?: boolean;
  /** Start with this city selected (a business owner starts with their own city). */
  startCity?: string;
  intro: ReactNode;
  emptyText: ReactNode;
}

/** HVAC permits ranked Hot, Warm and Cold, with filters and a detail panel. Used by the admin and by business owners. */
export function PermitBoard({ permits, error, cover, directory = [], adminLinks = false, startCity = "all", intro, emptyText }: Props) {
  const [city, setCity] = useState(startCity);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return permits
      .map((p) => ({ ...p, people: p.people ?? [] }))
      .filter((p) => (city === "all" || p.city === city) && (kind === "all" || p.property_class === kind)
        && (!term || `${p.summary} ${p.address ?? ""} ${p.contractor_name ?? ""} ${p.source_id} ${p.people.map((x) => `${x.name ?? ""} ${x.company ?? ""} ${x.phone ?? ""}`).join(" ")}`.toLowerCase().includes(term)))
      .map((p) => ({ p, ...scorePermit(p, cover) }))
      .sort((a, b) => b.score - a.score || (b.p.issued_on ?? "").localeCompare(a.p.issued_on ?? ""));
  }, [permits, cover, city, kind, q]);
  const cityList = [...new Set(permits.map((p) => p.city))].sort();
  const latest = permits.reduce((m, p) => (p.imported_at > m ? p.imported_at : m), "");
  const open = openId ? rows.find((r) => r.p.id === openId) ?? null : null;

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
        <label className="flex items-center gap-2 font-medium text-slate-700">Property
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            <option value="all">Residential and commercial</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label className="sr-only" htmlFor="permit-q">Search permits</label>
        <input id="permit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address, contractor, phone, permit #" className={searchClass} />
        <span className="text-xs text-slate-500">{rows.length} {rows.length === 1 ? "permit" : "permits"}{latest ? ` · last scrape ${new Date(latest).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
      </div>

      {error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Permits could not be loaded. Run <code>supabase/schema-permits.sql</code> and <code>supabase/schema-bids.sql</code> in the Supabase SQL Editor.</p>
      ) : permits.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">{emptyText}</p>
      ) : (
        <TierColumns rows={rows} itemKey={(r) => r.p.id} card={(r) => <Card row={r} onOpen={() => setOpenId(r.p.id)} />} />
      )}

      {open && <Detail row={open} directory={directory} adminLinks={adminLinks} onClose={() => setOpenId(null)} />}
    </div>
  );
}
