import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock, MapPin } from "lucide-react";
import { PageTitle, Panel, StatCard } from "@/components/admin/widgets";
import { buttonClass } from "@/components/ui/Button";
import { planName } from "@/config/pricing";
import { useNow } from "@/lib/admin-hooks";
import { activePlan } from "@/lib/plans";
import { ClaimListing } from "./ClaimListing";
import { useContractor } from "./context";
import { ago, useMyLeads } from "./useMyLeads";

export default function ContractorHome() {
  const { listing, claim } = useContractor();
  const { leads } = useMyLeads(Boolean(listing));
  const now = useNow(60_000);

  if (!listing) {
    return (
      <>
        <PageTitle title="Welcome" />
        <div className="max-w-2xl space-y-6">
          {claim?.status === "pending" ? (
            <Panel title="Request received">
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                We&apos;re reviewing your request. Once it&apos;s approved you&apos;ll be able to edit your profile, choose a plan and see customer requests here.
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

  const plan = activePlan(listing);
  const count = (status: string) => leads?.filter((l) => l.contractor_status === status).length ?? "…";
  const waiting = (leads ?? []).filter((l) => l.contractor_status === "new");
  const published = listing.status === "published";
  const receiving = plan !== "free" && published;
  const areas = [...new Set([listing.city, ...(listing.service_areas ?? "").split(",").map((a) => a.trim())].filter(Boolean))];
  const endsSoon = plan !== "free" && Boolean(listing.plan_until) && new Date(listing.plan_until as string).getTime() - now < 7 * 864e5;
  const checklist = [
    { done: Boolean(listing.description && listing.description.length >= 40), label: "Write a description of your business", to: "/contractor/profile" },
    { done: listing.services.length > 0, label: "Choose the services you offer", to: "/contractor/profile" },
    { done: Boolean(listing.phone), label: "Add a phone number", to: "/contractor/profile" },
    { done: Boolean(listing.service_areas), label: "List the other cities you serve, so you get requests there too", to: "/contractor/profile" },
    { done: plan !== "free", label: "Choose a Featured or Premium plan to receive requests", to: "/contractor/billing" },
    { done: Boolean(listing.google_place_id), label: "Connect your Google listing to show stars (Featured and Premium)", to: "/contractor/profile" },
  ];

  return (
    <>
      <PageTitle title={listing.business_name} />
      {!published && (
        <p className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
          Your listing is <strong>{listing.status}</strong>, so it isn&apos;t public yet. We publish listings after a quick review. Requests are sent only to published listings.
        </p>
      )}

      {waiting.length > 0 && (
        <Link to="/contractor/leads?status=new" className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-300 bg-blue-50 p-4 transition-colors hover:bg-blue-100">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-white">{waiting.length}</span>
          <span>
            <span className="block font-semibold text-navy">{waiting.length === 1 ? "1 new customer request is waiting" : `${waiting.length} new customer requests are waiting`}</span>
            <span className="text-sm text-slate-700">Contact them as soon as you can, then update the status.</span>
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New requests" value={count("new")} hint="Not contacted yet" />
        <StatCard label="Contacted" value={count("contacted")} hint="Waiting on the customer" />
        <StatCard label="Won" value={count("won")} hint={leads ? `${leads.length} received in total` : undefined} />
        <StatCard label="Current plan" value={planName(plan)} hint={plan === "free" ? "No new requests on Basic" : endsSoon ? `Ends ${new Date(listing.plan_until as string).toLocaleDateString()}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Request delivery">
          <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${receiving ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
            <span className={`size-2 rounded-full ${receiving ? "bg-green-600" : "bg-amber-500"}`} aria-hidden />
            {receiving ? "Receiving requests" : plan === "free" ? "Not receiving requests" : "Paused until your listing is published"}
          </p>
          {plan === "free" ? (
            <p className="mt-3 text-sm text-slate-700">
              New customer requests are sent automatically to Featured and Premium contractors. <Link to="/contractor/billing" className="font-semibold text-primary underline">Choose a plan</Link> to start receiving them.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-700">You get requests from customers in:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <li key={a} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800"><MapPin className="size-3.5 text-primary" aria-hidden /> {a}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Each request goes to up to 3 contractors in the customer&apos;s area, Premium first, then in turn. Not every request will reach you, and we can&apos;t promise any number of requests or jobs.
                {!listing.service_areas && <> Add the other cities you serve in <Link to="/contractor/profile" className="font-semibold text-primary underline">My profile</Link> to receive requests there too.</>}
              </p>
            </>
          )}
        </Panel>

        <Panel title="Newest requests">
          {waiting.length === 0 ? (
            <p className="text-sm text-slate-500">{leads === null ? "Loading…" : "No new requests right now. New ones show up here as soon as they arrive."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {waiting.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy">{l.first_name} {l.last_name}</span>
                    <span className="block truncate text-sm text-slate-600">{l.issue} · {l.city}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{ago(l.assigned_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/contractor/leads" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">Open all requests →</Link>
        </Panel>
      </div>

      <div className="mt-6 max-w-2xl">
        <Panel title="Make your listing stronger">
          <ul className="space-y-3">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                {c.done ? <CheckCircle2 className="size-5 shrink-0 text-green-600" aria-hidden /> : <Circle className="size-5 shrink-0 text-slate-300" aria-hidden />}
                <span className={c.done ? "text-slate-500 line-through" : "text-slate-800"}>{c.label}</span>
                {!c.done && <Link to={c.to} className="ml-auto text-sm font-semibold text-primary hover:underline">Do it</Link>}
              </li>
            ))}
          </ul>
        </Panel>
        {plan === "free" && <Link to="/contractor/billing" className={buttonClass("primary", "mt-5 !rounded-full")}>See plans</Link>}
      </div>
    </>
  );
}
