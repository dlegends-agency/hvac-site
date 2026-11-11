import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Mail, MapPin, Phone, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "@/lib/admin-hooks";
import { TIERS, ageText, scorePermit, type Coverage, type Scored, type Tier } from "@/lib/permit-score";
import { PERMIT_CLASS_STYLE, matchDirectory, permitTitle, permitValue, type DirectoryBusiness, type PermitPerson, type PublicPermit } from "@/lib/permits";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle } from "./widgets";

const TIER_STYLE: Record<Tier, { bar: string; score: string; head: string }> = {
  hot: { bar: "border-l-red-500", score: "text-red-600", head: "text-red-600" },
  warm: { bar: "border-l-amber-400", score: "text-amber-500", head: "text-amber-500" },
  cold: { bar: "border-l-sky-400", score: "text-sky-500", head: "text-sky-500" },
};

interface Row {
  p: PublicPermit;
  s: Scored;
}

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date");

/** The small card: just enough to tell permits apart. Click it for everything. */
function Card({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { p, s } = row;
  const style = TIER_STYLE[s.tier];
  return (
    <li>
      <button type="button" onClick={onOpen} className={`block w-full rounded-xl border border-slate-200 border-l-4 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow focus-visible:outline-2 focus-visible:outline-primary ${style.bar}`}>
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-navy">{permitTitle(p)}</span>
            <span className="block text-sm text-slate-600">{permitValue(p.value_usd)} · {ageText(s.ageDays)}</span>
          </span>
          <span className={`text-2xl leading-none font-extrabold ${style.score}`} aria-label={`Score ${s.score}`}>{s.score}</span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${PERMIT_CLASS_STYLE[p.property_class]}`}>{p.property_class}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{p.city}</span>
          {p.contractor_name && <span className="truncate text-slate-500">{p.contractor_name}</span>}
        </span>
      </button>
    </li>
  );
}

function Person({ person, directory }: { person: PermitPerson; directory: DirectoryBusiness | null }) {
  const place = [person.city, person.state, person.zip].filter(Boolean).join(" ");
  const email = person.email ?? directory?.email ?? null;
  return (
    <li className="rounded-xl border border-slate-200 p-3 text-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{person.role}</p>
      <p className="font-semibold text-navy">{person.company ?? person.name}</p>
      {person.company && person.name && <p className="text-slate-700">{person.name}</p>}
      <dl className="mt-2 space-y-1 text-slate-700">
        <div className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{person.phone ? <a href={`tel:${person.phone.replace(/\D/g, "")}`} className="text-primary hover:underline">{person.phone}</a> : <span className="text-slate-400">No phone listed</span>}</dd></div>
        <div className="flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{email ? <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a> : <span className="text-slate-400">No email in the open data</span>}{!person.email && email && <span className="ml-1 text-xs text-slate-500">(from your directory)</span>}</dd></div>
        <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><dd>{person.address || place ? <>{person.address}{person.address && place ? ", " : ""}{place}</> : <span className="text-slate-400">No address listed</span>}</dd></div>
      </dl>
      {directory && (
        <p className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-green-900">
          In your directory: <Link to={`/admin/listings/${directory.id}`} className="font-semibold underline">{directory.business_name}</Link>{directory.website ? " · has a website" : ""}
        </p>
      )}
    </li>
  );
}

/** Everything about one permit, in a panel over the page. */
function Detail({ row, directory, onClose }: { row: Row; directory: DirectoryBusiness[]; onClose: () => void }) {
  const { p, s } = row;
  const style = TIER_STYLE[s.tier];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const fact = (label: string, value: string | null) => value ? <div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="text-sm text-slate-800">{value}</dd></div> : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Permit details" onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-xs font-bold tracking-wide uppercase ${style.score}`}>{TIERS[s.tier].label} · {TIERS[s.tier].hint}</p>
            <h2 className="mt-1 text-xl font-extrabold text-navy">{permitTitle(p)}</h2>
            <p className="text-sm text-slate-600">{p.address ? `${p.address}, ` : ""}{p.city}{p.zip ? ` ${p.zip}` : ""}</p>
          </div>
          <div className="flex items-start gap-3">
            <p className={`text-4xl leading-none font-extrabold ${style.score}`} aria-label={`Score ${s.score} out of 100`}>{s.score}</p>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" aria-hidden /></button>
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{p.summary}</p>

        <h3 className="mt-6 text-sm font-bold text-navy">Why this score</h3>
        <ul className="mt-2 space-y-2">
          {s.parts.map((x) => (
            <li key={x.label} className="text-sm">
              <div className="flex justify-between text-slate-700"><span className="font-medium">{x.label}</span><span>{x.points} / {x.max}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${(x.points / x.max) * 100}%` }} /></div>
              <p className="mt-0.5 text-xs text-slate-500 first-letter:uppercase">{x.reason}</p>
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-sm font-bold text-navy">Permit</h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {fact("Permit number", p.source_id)}
          {fact("Permit type", p.permit_type)}
          {fact("Issued", `${day(p.issued_on)} (${ageText(s.ageDays)})`)}
          {fact("Project value", permitValue(p.value_usd))}
          {fact("Property", p.property_class[0].toUpperCase() + p.property_class.slice(1))}
          {fact("Source", p.source === "austin" ? "City of Austin open data" : p.source === "dallas" ? "City of Dallas open data" : p.source)}
        </dl>
        {p.description && <><h3 className="mt-6 text-sm font-bold text-navy">Work described</h3><p className="mt-1 text-sm whitespace-pre-line text-slate-700">{p.description}</p></>}

        <h3 className="mt-6 text-sm font-bold text-navy">People details</h3>
        {p.people.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{p.contractor_name ? `Contractor: ${p.contractor_name}. ` : ""}No other details were published for this permit. They are scraped again each morning.</p>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {p.people.map((person, i) => <Person key={`${person.role}-${i}`} person={person} directory={matchDirectory(person, directory)} />)}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          The city&apos;s open data lists the contractor&apos;s company, contact, phone and a shortened address. It does not include email addresses or the general contractor: those are on the city&apos;s own People Details page
          {p.source_url ? <>, open it with <a href={p.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">City record <ExternalLink className="size-3" aria-hidden /></a>.</> : "."}
          {" "}An email shown as &quot;from your directory&quot; comes from a listing with the same phone number or name.
        </p>
      </aside>
    </div>
  );
}

/** HVAC permits from city open-data portals, ranked Hot, Warm and Cold, kept apart from the directory and customer requests. */
export function PermitsAdmin() {
  const supabase = getSupabaseBrowser();
  const [city, setCity] = useState("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const permits = useLiveQuery<PublicPermit[]>(
    [],
    () => supabase.from("public_permits").select("*").eq("trade", "HVAC").order("issued_on", { ascending: false, nullsFirst: false }).limit(1000),
    { key: "permits-hvac", intervalMs: 120_000 },
  );
  // Our directory: where we have contractors, and the contractors we already know (to fill in an email).
  const directory = useLiveQuery<(DirectoryBusiness & { status: string })[]>(
    [],
    () => supabase.from("listings").select("id, business_name, slug, phone, email, website, city, status").limit(5000),
    { key: "permits-directory", intervalMs: null },
  );
  const cover = useMemo<Coverage>(() => {
    const published = directory.data.filter((l) => l.status === "published");
    return { cities: new Set(published.map((l) => (l.city ?? "").trim().toLowerCase()).filter(Boolean)), stateCovered: published.length > 0 };
  }, [directory.data]);

  const rows = useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    return permits.data
      .map((p) => ({ ...p, people: p.people ?? [] }))
      .filter((p) => (city === "all" || p.city === city) && (kind === "all" || p.property_class === kind)
        && (!term || `${p.summary} ${p.address ?? ""} ${p.contractor_name ?? ""} ${p.source_id} ${p.people.map((x) => `${x.name ?? ""} ${x.company ?? ""} ${x.phone ?? ""}`).join(" ")}`.toLowerCase().includes(term)))
      .map((p) => ({ p, s: scorePermit(p, cover) }))
      .sort((a, b) => b.s.score - a.s.score || (b.p.issued_on ?? "").localeCompare(a.p.issued_on ?? ""));
  }, [permits.data, cover, city, kind, q]);
  const cityList = [...new Set(permits.data.map((p) => p.city))].sort();
  const latest = permits.data.reduce((m, p) => (p.imported_at > m ? p.imported_at : m), "");
  const open = openId ? rows.find((r) => r.p.id === openId) ?? null : null;

  return (
    <div className="w-full">
      <PageTitle title="Permits" />
      <p className="mb-5 text-sm text-slate-600">
        New <strong>HVAC</strong> permits from city open-data portals, scraped every day at 8:00 AM Philippine time. Each one is scored from 0 to 100: how fresh it is (35), its project value (25),
        the kind and size of the job (20) and whether we have contractors in that city (20). <strong>Hot</strong> is 65 or more, <strong>Warm</strong> is 35 to 64, <strong>Cold</strong> is under 35.
        Click a permit to see everything about it, including the contractor&apos;s details. This is public record data kept for your research. Nothing is sent to anyone from here.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-700">City
          <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">All cities</option>
            {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">Property
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">Residential and commercial</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label className="sr-only" htmlFor="permit-q">Search permits</label>
        <input id="permit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address, contractor, phone, permit #" className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 sm:w-80" />
        <span className="text-xs text-slate-500">{rows.length} permits{latest ? ` · last scrape ${new Date(latest).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
      </div>

      {permits.error ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Permits could not be loaded. Run <code>supabase/schema-permits.sql</code> in the Supabase SQL Editor.</p>
      ) : permits.data.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">No permits yet. Run the permits import (GitHub Actions &gt; Permits import &gt; Run workflow). After that it runs by itself every day.</p>
      ) : (
        <div className="grid w-full items-start gap-5 md:grid-cols-2 2xl:grid-cols-[1.2fr_1.2fr_0.8fr]">
          {(["hot", "warm", "cold"] as Tier[]).map((tier) => {
            const list = rows.filter((r) => r.s.tier === tier);
            return (
              <section key={tier} aria-label={TIERS[tier].label} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className={`text-2xl font-extrabold tracking-tight uppercase ${TIER_STYLE[tier].head}`}>{TIERS[tier].label} <span className="text-base font-semibold text-slate-500">({list.length})</span></h2>
                  <span className="text-xs text-slate-500">{TIERS[tier].hint}</span>
                </div>
                {list.length === 0 ? <p className="text-sm text-slate-500">None right now.</p> : (
                  <ul className="grid max-h-[75vh] gap-2.5 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-1">
                    {list.slice(0, 80).map((r) => <Card key={r.p.id} row={r} onOpen={() => setOpenId(r.p.id)} />)}
                    {list.length > 80 && <li className="text-center text-xs text-slate-500 lg:col-span-2 2xl:col-span-1">Showing the top 80 of {list.length}. Use the filters to narrow it down.</li>}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {open && <Detail row={open} directory={directory.data} onClose={() => setOpenId(null)} />}
    </div>
  );
}
