import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bookmark, BookmarkCheck, Briefcase, Building2, Check, Circle, Clock, FileText, HardHat, Inbox, Landmark, Lock, LockOpen, MapPin, Search, Sparkles, Target, Trophy } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { inputClass } from "@/components/ui/Field";
import { planName } from "@/config/pricing";
import { useLiveQuery, useNow } from "@/lib/admin-hooks";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Listing } from "@/lib/types";
import { PerformancePanel } from "./PerformancePanel";
import { ClaimListing } from "./ClaimListing";
import { useContractor } from "./context";
import { type HubItem, KIND_LABEL, KIND_PLURAL, KIND_STYLE, type LeadKind, useLeadHub } from "./useLeadHub";
import { ago } from "./useMyLeads";

type Tab = "all" | LeadKind;
const SHOWN = 8;
const DAY = 86_400_000;
const KIND_ICON = { lead: Inbox, permit: HardHat, bid: Landmark } as const;
const KIND_TILE = { lead: "bg-blue-50 text-blue-700", permit: "bg-amber-50 text-amber-700", bid: "bg-violet-50 text-violet-700" } as const;

interface Step {
  title: string;
  body: string;
  to: string;
  cta: string;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function Stat({ icon: Icon, label, value, hint, to, tone }: { icon: typeof Target; label: string; value: React.ReactNode; hint?: string; to: string; tone: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-blue-50/30">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon className="size-6" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-2xl leading-tight font-bold text-navy tabular-nums">{value}</span>
        <span className="block truncate text-sm text-slate-600">{label}</span>
        {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
      </span>
    </Link>
  );
}

/** A circle that fills to the share of the profile that is complete. */
function Ring({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0" role="img" aria-label={`${percent}% complete`}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-slate-200" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="fill-navy text-[15px] font-bold">{percent}%</text>
    </svg>
  );
}

/** The dashboard of a connected business: what to do next, the numbers, the best leads to look at, and the profile and assistant on the side. */
function Dashboard({ listing }: { listing: Listing }) {
  const hub = useLeadHub(listing);
  const recs = useLiveQuery<{ status: string }[]>([], () => getSupabaseBrowser().rpc("my_recommendations"), { key: "home-recommendations", intervalMs: 120_000 });
  const now = useNow(60_000);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);

  const plan = activePlan(listing);
  const published = listing.status === "published";
  const { items, pipeline } = hub;
  const ready = !hub.loading;

  const savedKeys = useMemo(() => new Set(pipeline.map((r) => `${r.kind}:${r.item_id}`)), [pipeline]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const saved = pipeline.filter((r) => r.stage === "saved");
  const active = pipeline.filter((r) => !["saved", "won", "lost"].includes(r.stage));
  const won = pipeline.filter((r) => r.stage === "won").length;
  const unlockedMine = pipeline.filter((r) => byKey.get(`${r.kind}:${r.item_id}`)?.unlocked).length;
  const fresh = items.filter((i) => i.when && now - new Date(i.when.length === 10 ? `${i.when}T12:00:00Z` : i.when).getTime() < 7 * DAY).length;
  const newRequests = (hub.leads ?? []).filter((l) => l.contractor_status === "new").length;
  const recsWaiting = recs.error ? 0 : recs.data.filter((r) => r.status === "pending").length;
  const readyToStart = saved.filter((r) => byKey.get(`${r.kind}:${r.item_id}`)?.unlocked).length;

  const core = [
    { done: Boolean(listing.phone), label: "Business phone number" },
    { done: Boolean(listing.address), label: "Street address" },
    { done: Boolean(listing.postal_code), label: "ZIP code and travel distance" },
    { done: Boolean(listing.description && listing.description.length >= 40), label: "About us" },
  ];
  const extras = plan === "free" ? [] : [
    { done: listing.services.length > 0, label: "Services you offer" },
    { done: Boolean(listing.service_areas), label: "Other cities you serve" },
    { done: Boolean(listing.google_place_id), label: "Google listing and star rating" },
  ];
  const checklist = [...core, ...extras];
  const percent = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);
  const coreLeft = core.filter((c) => !c.done);

  let step: Step;
  if (coreLeft.length > 0) {
    step = { title: `Finish your profile: add ${coreLeft[0].label.toLowerCase()}`, body: "A complete profile gets approved faster and gets you better leads.", to: "/contractor/business", cta: "Open profile" };
  } else if (!published) {
    step = { title: "Your listing is waiting for review", body: "We publish listings after a quick review. Customer requests go only to published listings.", to: "/contractor/business", cta: "Check details" };
  } else if (newRequests > 0) {
    step = { title: `${newRequests} new customer ${newRequests === 1 ? "request is" : "requests are"} waiting`, body: "Reply fast: the first contractor to answer usually wins the job.", to: "/contractor/leads?type=lead", cta: "Open requests" };
  } else if (recsWaiting > 0) {
    step = { title: `${recsWaiting} customer ${recsWaiting === 1 ? "recommendation is" : "recommendations are"} waiting`, body: "Choose which ones to show on your listing.", to: "/contractor/recommendations", cta: "Review" };
  } else if (readyToStart > 0) {
    step = { title: `${readyToStart} saved ${readyToStart === 1 ? "lead is" : "leads are"} unlocked`, body: "Start a project to track the quote and follow-ups.", to: "/contractor/my-leads", cta: "Start a project" };
  } else {
    step = { title: items.length > 0 ? `${items.length.toLocaleString()} leads near you` : "No leads in your area yet", body: items.length > 0 ? "Save the ones worth a look and unlock them when you decide." : "New permits and bids are added every morning. Check your ZIP code and travel distance.", to: items.length > 0 ? "/contractor/leads" : "/contractor/business", cta: items.length > 0 ? "Find leads" : "Check my service area" };
  }

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: items.length, lead: 0, permit: 0, bid: 0 };
    for (const i of items) c[i.kind]++;
    return c;
  }, [items]);
  const cities = useMemo(() => [...new Set(items.map((i) => i.city).filter((c): c is string => Boolean(c)))].sort(), [items]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => (tab === "all" || i.kind === tab) && (city === "all" || i.city === city) && (!term || `${i.title} ${i.place}`.toLowerCase().includes(term)))
      .sort((a, b) => b.score - a.score || (b.when ?? "").localeCompare(a.when ?? ""));
  }, [items, tab, city, q]);

  async function save(i: HubItem) {
    setSaving(i.key);
    await hub.save([i]);
    setSaving(null);
  }

  const TABS: { id: Tab; label: string }[] = [{ id: "all", label: "All leads" }, { id: "lead", label: KIND_PLURAL.lead }, { id: "permit", label: KIND_PLURAL.permit }, { id: "bid", label: KIND_PLURAL.bid }];

  return (
    <>
      <PageTitle title={`${greeting()}, ${listing.business_name}`} description="Find, unlock and win more HVAC requests, building permits and government bids." />

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-primary/30 bg-blue-50/60 px-5 py-4">
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">Next step</span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-semibold text-navy">{step.title}</p>
          <p className="text-sm text-slate-700">{step.body}</p>
        </div>
        <Link to={step.to} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-90">{step.cta} <ArrowRight className="size-4" aria-hidden /></Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Stat icon={Target} label="New this week" value={ready ? fresh : "…"} hint={newRequests > 0 ? `${newRequests} customer ${newRequests === 1 ? "request" : "requests"} to answer` : undefined} to="/contractor/leads" tone="bg-blue-50 text-primary" />
            <Stat icon={LockOpen} label="Unlocked leads" value={ready ? unlockedMine : "…"} hint={saved.length > 0 ? `${saved.length} saved` : undefined} to="/contractor/my-leads" tone="bg-green-50 text-green-700" />
            <Stat icon={FileText} label="Active projects & bids" value={ready ? active.length : "…"} to="/contractor/projects" tone="bg-violet-50 text-violet-700" />
            <Stat icon={Trophy} label="Won" value={ready ? won : "…"} hint="All time" to="/contractor/projects" tone="bg-amber-50 text-amber-700" />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="best-leads">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="best-leads" className="flex items-center gap-2 text-lg font-bold text-navy"><Target className="size-5 text-primary" aria-hidden /> Leads for you</h2>
              <Link to="/contractor/leads" className="text-sm font-semibold text-primary hover:underline">View all leads →</Link>
            </div>

            <div role="tablist" aria-label="Lead type" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 py-2 text-sm font-semibold ${tab === t.id ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-navy"}`}>
                  {t.label} ({ready ? counts[t.id] : "…"})
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-52 flex-1">
                <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-slate-400" aria-hidden />
                <label htmlFor="dash-q" className="sr-only">Search leads</label>
                <input id="dash-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, cities, agencies…" className={`${inputClass} !py-2.5 !pl-9`} />
              </div>
              <label className="sr-only" htmlFor="dash-city">City</label>
              <select id="dash-city" value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="all">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="mt-4">
              {!ready ? (
                <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
              ) : list.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">{items.length === 0 ? "No leads within reach yet. New ones are added every morning." : "No leads match."}</p>
              ) : (
                <ul className="grid gap-3">
                  {list.slice(0, SHOWN).map((i) => {
                    const Icon = KIND_ICON[i.kind];
                    // Customer requests are titled "Name: concern". Show them as two separate things.
                    const cut = i.kind === "lead" ? i.title.indexOf(": ") : -1;
                    const heading = cut > 0 ? i.title.slice(0, cut) : i.title;
                    const concern = cut > 0 ? i.title.slice(cut + 2) : "";
                    const isSaved = savedKeys.has(i.key);
                    return (
                      <li key={i.key} className="flex flex-wrap items-stretch gap-4 rounded-xl border border-slate-200 p-3 transition-colors hover:border-primary/40 sm:flex-nowrap">
                        <span className={`hidden size-20 shrink-0 place-items-center rounded-xl sm:grid ${KIND_TILE[i.kind]}`}><Icon className="size-9" aria-hidden /></span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[i.kind]}`}>{KIND_LABEL[i.kind]}</span>
                            {i.urgent && i.kind !== "lead" && <span className="rounded-full bg-emergency-soft px-2 py-0.5 text-xs font-semibold text-emergency">{i.kind === "bid" ? "Closing soon" : "Needs help now"}</span>}
                          </p>
                          <Link to={`/contractor/leads?open=${i.key}`} className="mt-1 line-clamp-2 block font-semibold text-navy hover:text-primary">{heading}</Link>
                          {concern && <p className="mt-1 line-clamp-2 text-sm text-slate-600"><span className="font-semibold text-slate-500">Concern: </span>{concern}</p>}
                          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            {i.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> {i.place}</span>}
                            {i.when && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {ago(i.when.length === 10 ? `${i.when}T12:00:00Z` : i.when)}</span>}
                          </p>
                        </div>
                        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 border-t border-slate-200 pt-3 sm:w-44 sm:items-end sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                          <div className="flex items-start justify-between gap-2 sm:w-full">
                            <div className="sm:text-right">
                              {i.fact && <p className="text-sm font-bold text-navy">{i.fact}</p>}
                              {i.unlocked
                                ? <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800"><Check className="size-3" aria-hidden /> {plan === "premium" ? "Premium" : "Unlocked"}</span>
                                : <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900"><Lock className="size-3" aria-hidden /> Locked</span>}
                            </div>
                            <button type="button" onClick={() => void (isSaved ? Promise.resolve() : save(i))} disabled={isSaved || saving === i.key}
                              aria-label={isSaved ? "Saved" : `Save: ${i.title}`} title={isSaved ? "Saved" : "Save for later"}
                              className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-primary disabled:text-primary">
                              {isSaved ? <BookmarkCheck className="size-5" aria-hidden /> : <Bookmark className="size-5" aria-hidden />}
                            </button>
                          </div>
                          <Link to={`/contractor/leads?open=${i.key}`}
                            className={`rounded-lg px-4 py-2 text-center text-sm font-semibold ${i.unlocked ? "border border-slate-300 bg-white text-navy hover:bg-slate-50" : "bg-primary text-white hover:opacity-90"}`}>
                            {i.unlocked ? "View details" : `Unlock for $${i.price}`}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {list.length > SHOWN && <Link to={tab === "all" ? "/contractor/leads" : `/contractor/leads?type=${tab}`} className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">See all {list.length.toLocaleString()} leads →</Link>}
            </div>
          </section>

          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-navy">Last 30 days</summary>
            <div className="mt-3"><PerformancePanel /></div>
          </details>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="profile-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="profile-card" className="flex items-center gap-2 font-bold text-navy"><Building2 className="size-5 text-primary" aria-hidden /> Business profile</h2>
                <p className="mt-1 text-sm text-slate-600">{percent === 100 ? "Your profile is complete." : "Complete your profile to get better matches."}</p>
              </div>
              <Ring percent={percent} />
            </div>
            <ul className="mt-4 space-y-2">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2.5 text-sm">
                  {c.done ? <Check className="size-5 shrink-0 rounded-full bg-green-600 p-0.5 text-white" aria-hidden /> : <Circle className="size-5 shrink-0 text-slate-300" aria-hidden />}
                  <span className={c.done ? "text-slate-700" : "font-medium text-navy"}>{c.label}</span>
                </li>
              ))}
            </ul>
            <Link to="/contractor/business" className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/40 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-blue-50">
              {percent === 100 ? "View profile" : "Complete profile"} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="assistant-card">
            <h2 id="assistant-card" className="flex items-center gap-2 font-bold text-navy"><Sparkles className="size-5 text-violet-600" aria-hidden /> AI assistant</h2>
            <p className="mt-1 text-sm text-slate-600">Ask in plain language, or have it draft a reply.</p>
            <div className="mt-3 flex flex-col gap-2">
              {["What is new today?", "Draft a reply to my newest customer request"].map((s) => (
                <button key={s} type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-assistant", { detail: { text: s } }))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-violet-300 hover:bg-violet-50">{s}</button>
              ))}
            </div>
            {plan === "free" && <p className="mt-3 text-xs text-slate-500">The assistant is part of <Link to="/contractor/billing" className="font-semibold text-primary underline">Featured</Link> and Premium.</p>}
          </section>

          {recsWaiting > 0 && (
            <Link to="/contractor/recommendations" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 hover:bg-amber-100">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500 font-bold text-white">{recsWaiting}</span>
              <span className="text-sm font-semibold text-navy">Customer {recsWaiting === 1 ? "recommendation" : "recommendations"} waiting</span>
            </Link>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="plan-card">
            <h2 id="plan-card" className="flex items-center gap-2 font-bold text-navy"><Briefcase className="size-5 text-primary" aria-hidden /> {planName(plan)} plan</h2>
            <p className="mt-1 text-sm text-slate-600">
              {plan === "premium" ? "Every lead is unlocked for you." : plan === "featured" ? "Pay half price to unlock. Premium unlocks every lead for you." : "Featured halves unlock prices. Premium unlocks every lead for you."}
            </p>
            {plan !== "premium" && <Link to="/contractor/billing" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">{plan === "free" ? "See plans" : "Go Premium"} <ArrowRight className="size-4" aria-hidden /></Link>}
          </section>
        </aside>
      </div>
    </>
  );
}

export default function ContractorHome() {
  const { listing, claim } = useContractor();

  if (!listing) {
    return (
      <>
        <PageTitle title="Welcome" />
        <div className="space-y-6">
          {claim?.status === "pending" ? (
            <Panel title="Request received">
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                We&apos;re reviewing your request. Once it&apos;s approved you&apos;ll be able to edit your business details, choose a plan and see customer requests here.
              </p>
            </Panel>
          ) : (
            <>
              {claim?.status === "rejected" && (
                <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                  We couldn&apos;t approve your last request. You can send a new one below, or <Link to="/contact" className="font-semibold underline">contact us</Link>.
                </p>
              )}
              <ClaimListing />
            </>
          )}
        </div>
      </>
    );
  }

  return <Dashboard listing={listing} />;
}
