import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookmarkCheck, BookmarkPlus, Check, Clock, Loader2, Lock, MapPin, Search, Sparkles } from "lucide-react";
import { PageTitle, Panel, StatStrip } from "@/components/admin/widgets";
import { BidDetail } from "@/components/opportunities/BidBoard";
import { PermitDetail } from "@/components/opportunities/PermitBoard";
import { TIER_STYLE } from "@/components/opportunities/shared";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { unlockCost, unlockPrice } from "@/config/pricing";
import { scoreBid } from "@/lib/bid-score";
import { scorePermit, TIERS } from "@/lib/permit-score";
import { callApi } from "./api";
import { LeadPanel } from "./ContractorLeads";
import { useContractor } from "./context";
import { KIND_LABEL, KIND_PLURAL, KIND_STYLE, type HubItem, type LeadKind, useLeadHub } from "./useLeadHub";
import { ago } from "./useMyLeads";

type Type = "all" | LeadKind;
type Show = "all" | "locked" | "unlocked" | "new";
type Sort = "best" | "newest";
const PAGE = 50;
const TYPES: { id: Type; label: string }[] = [
  { id: "all", label: "All leads" },
  { id: "lead", label: KIND_PLURAL.lead },
  { id: "bid", label: KIND_PLURAL.bid },
  { id: "permit", label: KIND_PLURAL.permit },
];

/** The unlock fee for this plan as a short phrase, for the banner and the headers. */
const feeLine = (plan: "free" | "paid") => `customer request $${unlockPrice.lead[plan]}, building permit $${unlockPrice.permit[plan]}, government bid $${unlockPrice.bid[plan]}`;

/**
 * Leads: every source in one place. Customer requests from the website, building permits and government bids near the business, each tagged
 * with its type, how good a match it is and whether it is unlocked. Tick the ones worth a look and save them to My Leads.
 */
export default function ContractorLeadHub() {
  const { listing } = useContractor();
  const hub = useLeadHub(listing);
  const { items, plan, pipeline, reloadAll } = hub;
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("best");
  const [visible, setVisible] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const type: Type = params.get("type") === "lead" || params.get("type") === "bid" || params.get("type") === "permit" ? (params.get("type") as LeadKind) : "all";
  const openKey = params.get("open");

  // Coming back from Stripe after paying to unlock: ask the server to check the payment, then load everything again.
  const justPaid = params.get("unlocked") === "1";
  const sessionId = params.get("session_id");
  const [waiting, setWaiting] = useState(justPaid);
  useEffect(() => {
    if (!justPaid) return;
    if (sessionId) void callApi("/api/stripe/confirm", { sessionId }).then(() => reloadAll());
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      reloadAll();
      if (tries >= 6) {
        window.clearInterval(timer);
        setWaiting(false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [justPaid, sessionId, reloadAll]);

  const savedKeys = useMemo(() => new Set(pipeline.map((r) => `${r.kind}:${r.item_id}`)), [pipeline]);
  const cities = useMemo(() => [...new Set(items.map((i) => i.city).filter((c): c is string => Boolean(c)))].sort(), [items]);
  const counts = useMemo(() => {
    const c: Record<Type, number> = { all: items.length, lead: 0, bid: 0, permit: 0 };
    for (const i of items) c[i.kind]++;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => (type === "all" || i.kind === type)
        && (city === "all" || i.city === city)
        && (show === "all" || (show === "locked" ? !i.unlocked : show === "unlocked" ? i.unlocked : !savedKeys.has(i.key)))
        && (!term || `${i.title} ${i.place}`.toLowerCase().includes(term)))
      .sort((a, b) => (sort === "best" ? b.score - a.score : 0) || (b.when ?? "").localeCompare(a.when ?? ""));
  }, [items, type, city, show, sort, q, savedKeys]);

  if (!listing) {
    return (
      <>
        <PageTitle title="Leads" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }

  const setType = (t: Type) => {
    const next = new URLSearchParams(params);
    next.delete("unlocked");
    next.delete("session_id");
    if (t === "all") next.delete("type");
    else next.set("type", t);
    setParams(next, { replace: true });
    setVisible(PAGE);
  };
  const closeOpen = () => {
    const next = new URLSearchParams(params);
    for (const k of ["open", "lead", "unlocked", "session_id"]) next.delete(k);
    setParams(next, { replace: true });
  };
  const openItem = (i: HubItem) => {
    const next = new URLSearchParams(params);
    next.set("open", i.key);
    setParams(next, { replace: true });
  };

  const toggle = (key: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const pageRows = shown.slice(0, visible);
  const allPicked = pageRows.length > 0 && pageRows.every((r) => picked.has(r.key));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(pageRows.map((r) => r.key)));

  async function saveChosen(chosen: HubItem[]) {
    setSaving(true);
    setNote(null);
    const res = await hub.save(chosen);
    setSaving(false);
    if (!res.ok) return setNote({ ok: false, text: `We couldn't save. Has supabase/schema-revamp.sql been run? (${res.error})` });
    setPicked(new Set());
    setNote({ ok: true, text: `${chosen.length === 1 ? "Saved" : `${chosen.length} leads saved`} to My Leads.` });
  }

  const open = openKey ? items.find((i) => i.key === openKey) ?? null : null;
  const paidTier = plan === "free" ? "free" : "paid";
  const locked = items.filter((i) => !i.unlocked).length;
  const hot = items.filter((i) => i.tier === "hot").length;

  return (
    <>
      <PageTitle title="Leads" description="Every lead for your business in one list: requests from customers on our website, government bids and building permits near you." />

      {plan === "premium" ? (
        <p className="mb-5 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"><Sparkles className="size-4 shrink-0" aria-hidden /> Premium: every lead is fully unlocked for you, with phone, email and address.</p>
      ) : (
        <p className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-800">
          <strong>{plan === "free" ? "Free plan" : "Featured plan"}.</strong> {plan === "free" ? "You see a customer's first name, and a short preview of each permit and bid." : "You see a customer's full name, and a short preview of each permit and bid."} Unlock the full details when you decide: {feeLine(paidTier)}.{" "}
          <Link to="/contractor/billing" className="font-semibold text-primary underline">{plan === "free" ? "Go Featured to pay half, or Premium to unlock everything" : "Go Premium to unlock everything"}</Link>.
        </p>
      )}

      {waiting && justPaid && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900"><Loader2 className="size-4 animate-spin" aria-hidden /> Payment received. Unlocking, this takes a few seconds…</p>}

      <StatStrip items={[
        { label: "Customer requests", value: hub.loading ? "…" : counts.lead },
        { label: "Government bids", value: hub.loading ? "…" : counts.bid },
        { label: "Building permits", value: hub.loading ? "…" : counts.permit },
        { label: "Hot leads", value: hub.loading ? "…" : hot, tone: hot > 0 ? "good" : undefined },
        { label: "Saved in My Leads", value: pipeline.filter((r) => r.stage === "saved").length },
        { label: "Still locked", value: hub.loading ? "…" : locked, tone: locked > 0 && plan !== "premium" ? "warn" : undefined },
      ]} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Lead type" className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={type === t.id} onClick={() => setType(t.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${type === t.id ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy hover:bg-slate-50"}`}>
              {t.label} <span className={type === t.id ? "text-blue-100" : "text-slate-500"}>({hub.loading ? "…" : counts[t.id]})</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
          <label htmlFor="hub-q" className="sr-only">Search leads</label>
          <input id="hub-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or place…" className={`${inputClass} !py-2.5 !pl-9`} />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-700">City
          <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">Show
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="all">Everything</option>
            <option value="new">Not saved yet</option>
            <option value="locked">Locked</option>
            <option value="unlocked">Unlocked</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal">
            <option value="best">Best match first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
        <span className="text-xs text-slate-500">{shown.length} {shown.length === 1 ? "lead" : "leads"}</span>
      </div>

      {picked.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-white p-3 shadow-md">
          <p className="text-sm font-semibold text-navy">{picked.size} selected</p>
          <Button onClick={() => void saveChosen(items.filter((i) => picked.has(i.key)))} disabled={saving} className="!rounded-full !px-4 !py-2 text-sm">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BookmarkPlus className="size-4" aria-hidden />} Save to My Leads
          </Button>
          <button type="button" onClick={() => setPicked(new Set())} className="text-sm font-medium text-slate-600 underline">Clear</button>
        </div>
      )}
      <div role="status">{note && <p className={`mb-3 text-sm font-medium ${note.ok ? "text-green-700" : "text-red-700"}`}>{note.ok ? <>{note.text} <Link to="/contractor/my-leads" className="underline">Open My Leads</Link></> : note.text}</p>}</div>

      {hub.error && items.length === 0 ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Leads couldn&apos;t be loaded. Run <code>supabase/schema-revamp.sql</code> (and the permits and bids SQL files) in the Supabase SQL Editor.</p>
      ) : hub.loading ? (
        <p className="text-slate-600">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">{items.length === 0 ? "No leads within reach of your business yet. New ones are added every morning. Check that your ZIP code and travel distance are set under My business." : "No leads match these filters."}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all shown" className="size-4 rounded border-slate-300" />
            <span>Select all shown</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {pageRows.map((i) => {
              const saved = savedKeys.has(i.key);
              const tier = i.tier ? TIER_STYLE[i.tier] : null;
              return (
                <li key={i.key} className={`flex items-start gap-3 px-4 py-3 ${picked.has(i.key) ? "bg-blue-50/50" : ""}`}>
                  <input type="checkbox" checked={picked.has(i.key)} onChange={() => toggle(i.key)} aria-label={`Select: ${i.title}`} className="mt-1 size-4 shrink-0 rounded border-slate-300" />
                  <button type="button" onClick={() => openItem(i)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[i.kind]}`}>{KIND_LABEL[i.kind]}</span>
                      {i.tier && tier && <span className={`text-xs font-bold ${tier.score}`}>{TIERS[i.tier].label}</span>}
                      {i.urgent && i.kind === "bid" && <span className="rounded-full bg-emergency-soft px-2 py-0.5 text-xs font-semibold text-emergency">Closing soon</span>}
                      {i.urgent && i.kind === "lead" && <span className="rounded-full bg-emergency-soft px-2 py-0.5 text-xs font-semibold text-emergency">Needs help now</span>}
                    </span>
                    <span className="mt-1 block font-semibold text-navy">{i.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {i.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {i.place}</span>}
                      {i.when && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {ago(i.when.length === 10 ? `${i.when}T12:00:00Z` : i.when)}</span>}
                      {i.fact && <span className="font-semibold text-slate-700">{i.fact}</span>}
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {i.unlocked
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800"><Check className="size-3.5" aria-hidden /> {plan === "premium" ? "Unlocked (Premium)" : "Paid & unlocked"}</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900"><Lock className="size-3.5" aria-hidden /> Locked · ${i.price} to unlock</span>}
                    {saved
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><BookmarkCheck className="size-4" aria-hidden /> Saved</span>
                      : <button type="button" onClick={() => void saveChosen([i])} disabled={saving} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-60"><BookmarkPlus className="size-4" aria-hidden /> Save</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {shown.length > visible && (
        <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)} className="!rounded-full text-sm">Show {Math.min(PAGE, shown.length - visible)} more</Button></div>
      )}

      {open?.kind === "lead" && (() => {
        const lead = (hub.leads ?? []).find((l) => l.id === open.id);
        return lead ? <LeadPanel lead={lead} price={unlockCost(plan, "lead")} onSaved={hub.replaceLead} onClose={closeOpen} /> : null;
      })()}
      {open?.kind === "permit" && (() => {
        const p = hub.permits.find((x) => x.id === open.id);
        return p ? <PermitDetail row={{ p: { ...p, people: p.people ?? [] }, ...scorePermit(p, hub.cover) }} directory={[]} adminLinks={false} unlock={{ price: unlockCost(plan, "permit") }} compose={{ businessName: listing.business_name }} onClose={closeOpen} /> : null;
      })()}
      {open?.kind === "bid" && (() => {
        const b = hub.bids.find((x) => x.id === open.id);
        return b ? <BidDetail row={{ b, ...scoreBid(b, hub.cover) }} unlock={{ price: unlockCost(plan, "bid") }} compose={{ businessName: listing.business_name }} onClose={closeOpen} /> : null;
      })()}

      <p className="mt-8 max-w-3xl text-xs text-slate-500">
        Customer requests can be sent to up to three contractors, and we can&apos;t guarantee any number of requests or jobs. Permits and bids come from public records (city and federal open data) and are found for you each morning.
        Unlocked leads are not refundable. Use contact details only to respond to the lead and follow the rules that apply to calls, texts and emails.
      </p>
    </>
  );
}
