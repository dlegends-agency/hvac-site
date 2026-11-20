import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, Lock, MapPin } from "lucide-react";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { planName } from "@/config/pricing";
import { useLiveQuery } from "@/lib/admin-hooks";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Listing } from "@/lib/types";
import { PerformancePanel } from "./PerformancePanel";
import { ClaimListing } from "./ClaimListing";
import { useContractor } from "./context";
import { KIND_LABEL, KIND_STYLE, useLeadHub } from "./useLeadHub";
import { ago } from "./useMyLeads";

interface Step {
  title: string;
  body: string;
  to: string;
  cta: string;
}

/** A small number that links to the page it counts. */
function Tile({ label, value, to, hint }: { label: string; value: React.ReactNode; to: string; hint?: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-blue-50/30">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-navy tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Link>
  );
}

/** The dashboard of a connected business: one thing to do next, four numbers, and the newest leads. Everything else has its own page. */
function Dashboard({ listing }: { listing: Listing }) {
  const hub = useLeadHub(listing);
  const recs = useLiveQuery<{ status: string }[]>([], () => getSupabaseBrowser().rpc("my_recommendations"), { key: "home-recommendations", intervalMs: 120_000 });
  const plan = activePlan(listing);
  const published = listing.status === "published";
  const { items, pipeline } = hub;
  const ready = !hub.loading;

  const saved = pipeline.filter((r) => r.stage === "saved");
  const active = pipeline.filter((r) => !["saved", "won", "lost"].includes(r.stage));
  const newRequests = (hub.leads ?? []).filter((l) => l.contractor_status === "new").length;
  const recsWaiting = recs.error ? 0 : recs.data.filter((r) => r.status === "pending").length;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const readyToStart = saved.filter((r) => byKey.get(`${r.kind}:${r.item_id}`)?.unlocked).length;

  const core = [
    { done: Boolean(listing.phone), label: "Add a business phone number" },
    { done: Boolean(listing.address), label: "Add your street address" },
    { done: Boolean(listing.postal_code), label: "Add your ZIP code and how far you travel, so nearby leads reach you" },
    { done: Boolean(listing.description && listing.description.length >= 40), label: "Write your About us" },
  ];
  const extras = plan === "free" ? [] : [
    { done: listing.services.length > 0, label: "Choose the services you offer" },
    { done: Boolean(listing.service_areas), label: "List the other cities you serve" },
    { done: Boolean(listing.google_place_id), label: "Connect your Google listing to show your star rating" },
  ];
  const all = [...core, ...extras];
  const coreLeft = core.filter((c) => !c.done);
  const doneCount = all.filter((c) => c.done).length;

  let step: Step;
  if (coreLeft.length > 0) {
    step = { title: `Finish your profile (${coreLeft.length} ${coreLeft.length === 1 ? "thing" : "things"} left)`, body: `${coreLeft[0].label}. A complete profile gets approved faster and gets you better leads.`, to: "/contractor/business", cta: "Open business profile" };
  } else if (!published) {
    step = { title: "Your listing is waiting for review", body: "We publish listings after a quick review, usually within a day. Customer requests are sent only to published listings.", to: "/contractor/business", cta: "Check your details" };
  } else if (newRequests > 0) {
    step = { title: `${newRequests} new customer ${newRequests === 1 ? "request is" : "requests are"} waiting`, body: "Contact them as soon as you can. The first contractor to reply usually wins the job.", to: "/contractor/leads?type=lead", cta: "Open requests" };
  } else if (recsWaiting > 0) {
    step = { title: `${recsWaiting} customer ${recsWaiting === 1 ? "recommendation is" : "recommendations are"} waiting`, body: "Choose which ones to show on your listing.", to: "/contractor/recommendations", cta: "Review recommendations" };
  } else if (readyToStart > 0) {
    step = { title: `${readyToStart} saved ${readyToStart === 1 ? "lead is" : "leads are"} unlocked`, body: "You have the contact details. Start a project to track the quote and follow-ups.", to: "/contractor/my-leads", cta: "Start a project" };
  } else if (items.length > 0) {
    step = { title: `${items.length.toLocaleString()} leads near you`, body: "Customer requests, government bids and building permits. Save the ones worth a look and unlock them when you decide.", to: "/contractor/leads", cta: "Find leads" };
  } else {
    step = { title: "No leads in your area yet", body: "New permits and bids are added every morning. Check that your ZIP code and travel distance are set.", to: "/contractor/business", cta: "Check my service area" };
  }

  const newest = [...items].sort((a, b) => (b.when ?? "").localeCompare(a.when ?? "")).slice(0, 6);

  return (
    <>
      <PageTitle title={listing.business_name} />

      <section className="mb-6 rounded-2xl border border-primary/30 bg-blue-50/60 p-5 sm:p-6" aria-labelledby="next-step">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">Next step</p>
        <h2 id="next-step" className="mt-1 text-xl font-bold text-navy">{step.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-700">{step.body}</p>
        <Link to={step.to} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          {step.cta} <ArrowRight className="size-4" aria-hidden />
        </Link>
        {!published && coreLeft.length === 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600"><Clock className="size-3.5" aria-hidden /> Status: {listing.status}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="New requests" value={ready ? newRequests : "…"} to="/contractor/leads?type=lead" hint="From customers on our website" />
        <Tile label="Saved leads" value={ready ? saved.length : "…"} to="/contractor/my-leads" hint={readyToStart > 0 ? `${readyToStart} unlocked` : undefined} />
        <Tile label="Active projects" value={ready ? active.length : "…"} to="/contractor/projects" />
        <Tile label="Plan" value={planName(plan)} to="/contractor/billing" hint={plan === "free" ? "See what Featured adds" : undefined} />
      </div>

      <div className="mt-6">
        <Panel title="Newest leads">
          {!ready ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : newest.length === 0 ? (
            <p className="text-sm text-slate-500">No leads yet. New ones show up here as soon as they arrive.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {newest.map((i) => (
                <li key={i.key}>
                  <Link to={`/contractor/leads?open=${i.key}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[i.kind]}`}>{KIND_LABEL[i.kind]}</span>
                        {i.when && <span className="text-xs text-slate-500">{ago(i.when.length === 10 ? `${i.when}T12:00:00Z` : i.when)}</span>}
                      </span>
                      <span className="mt-1 block truncate font-semibold text-navy">{i.title}</span>
                      {i.place && <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="size-3.5 shrink-0" aria-hidden /> {i.place}</span>}
                    </span>
                    {i.unlocked
                      ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800"><Check className="size-3.5" aria-hidden /> Unlocked</span>
                      : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900"><Lock className="size-3.5" aria-hidden /> ${i.price}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/contractor/leads" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">See all leads →</Link>
        </Panel>
      </div>

      {doneCount < all.length && coreLeft.length === 0 && (
        <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          Profile {doneCount} of {all.length} complete. <Link to="/contractor/business" className="font-semibold text-primary underline">{all.find((c) => !c.done)?.label}</Link>
        </p>
      )}

      <details className="group mt-6">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-navy">Last 30 days</summary>
        <div className="mt-3"><PerformancePanel /></div>
      </details>
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
