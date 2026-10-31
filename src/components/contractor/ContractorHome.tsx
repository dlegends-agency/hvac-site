import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, CheckCircle2, Circle, Clock, MapPin } from "lucide-react";
import { PageTitle, Panel, StatCard } from "@/components/admin/widgets";
import { buttonClass } from "@/components/ui/Button";
import { leadPrice, planName } from "@/config/pricing";
import { useNow } from "@/lib/admin-hooks";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import { ClaimListing } from "./ClaimListing";
import { useContractor } from "./context";
import { ago, useMyLeads } from "./useMyLeads";

export default function ContractorHome() {
  const { listing, claim, email, notifyEmail, reload } = useContractor();
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertError, setAlertError] = useState(false);
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

  async function toggleAlerts() {
    setSavingAlerts(true);
    setAlertError(false);
    const { error } = await getSupabaseBrowser().rpc("set_my_email_alerts", { p_on: !notifyEmail });
    if (error) setAlertError(true);
    else await reload();
    setSavingAlerts(false);
  }

  const plan = activePlan(listing);
  const count = (status: string) => leads?.filter((l) => l.contractor_status === status).length ?? "…";
  const waiting = (leads ?? []).filter((l) => l.contractor_status === "new");
  const published = listing.status === "published";
  const receiving = published; // free and paid listings both receive requests
  const locked = (leads ?? []).filter((l) => !l.unlocked).length;
  const price = plan === "free" ? leadPrice.free : leadPrice.paid;
  const areas = [...new Set([listing.city, ...(listing.service_areas ?? "").split(",").map((a) => a.trim())].filter(Boolean))];
  const endsSoon = plan !== "free" && Boolean(listing.plan_until) && new Date(listing.plan_until as string).getTime() - now < 7 * 864e5;
  const checklist = [
    { done: Boolean(listing.phone), label: "Add a business phone number", to: "/contractor/business" },
    { done: Boolean(listing.address), label: "Add your street address", to: "/contractor/business" },
    { done: Boolean(listing.postal_code), label: "Add your ZIP code and how far you travel, so nearby requests reach you", to: "/contractor/business" },
    ...(plan === "free"
      ? [{ done: false, label: "Go Featured to show About us, services and service areas, connect Google reviews, and unlock requests for $" + leadPrice.paid, to: "/contractor/billing" }]
      : [
          { done: Boolean(listing.description && listing.description.length >= 40), label: "Write your About us", to: "/contractor/business" },
          { done: listing.services.length > 0, label: "Choose the services you offer", to: "/contractor/business" },
          { done: Boolean(listing.service_areas), label: "List the other cities you serve, so you get requests there too", to: "/contractor/business" },
          { done: Boolean(listing.google_place_id), label: "Connect your Google listing to show your star rating", to: "/contractor/business" },
        ]),
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
        <StatCard label="New requests" value={count("new")} hint={leads ? `${leads.length} received in total` : undefined} />
        <StatCard label="Locked" value={leads ? locked : "…"} hint={`$${price} each to unlock`} />
        <StatCard label="Contacted" value={count("contacted")} hint={`${count("won")} won`} />
        <StatCard label="Current plan" value={planName(plan)} hint={plan === "free" ? `Go Featured: $${leadPrice.paid} per request` : endsSoon ? `Ends ${new Date(listing.plan_until as string).toLocaleDateString()}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Request delivery">
          <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${receiving ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
            <span className={`size-2 rounded-full ${receiving ? "bg-green-600" : "bg-amber-500"}`} aria-hidden />
            {receiving ? "Receiving requests" : "Paused until your listing is published"}
          </p>
          <p className="mt-3 text-sm text-slate-700">You get requests from customers in:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {areas.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800"><MapPin className="size-3.5 text-primary" aria-hidden /> {a}</li>
            ))}
            {listing.postal_code && (
              <li className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-slate-800"><MapPin className="size-3.5 text-primary" aria-hidden /> within {listing.service_radius_miles ?? 30} miles of {listing.postal_code}</li>
            )}
          </ul>
          {!listing.postal_code && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Add your ZIP code in <Link to="/contractor/business" className="font-semibold underline">My business</Link> so we can also send you requests from customers nearby, not just in your own city.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            You see the customer&apos;s name and the problem for free. Unlock a request for ${price} to see how to reach them.
            {plan === "free" && <> <Link to="/contractor/billing" className="font-semibold text-primary underline">Go Featured</Link> to pay ${leadPrice.paid} instead and be sent requests first.</>}
            {" "}Each request goes to up to 3 contractors near the customer, paid listings first. We can&apos;t promise any number of requests or jobs.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <p className="flex items-start gap-2 text-sm text-slate-700">
              {notifyEmail ? <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <BellOff className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />}
              <span>{notifyEmail ? <>Email alerts are <strong>on</strong>. We&apos;ll email <strong>{email}</strong> when a request arrives.</> : <>Email alerts are <strong>off</strong>. You&apos;ll only see requests here.</>}</span>
            </p>
            <button type="button" role="switch" aria-checked={notifyEmail} aria-label="Email me new requests" disabled={savingAlerts} onClick={toggleAlerts}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold disabled:opacity-60 ${notifyEmail ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
              {notifyEmail ? "On" : "Off"}
            </button>
          </div>
          <div role="alert">{alertError && <p className="mt-2 text-sm font-medium text-red-700">Could not change that. Please try again.</p>}</div>
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
                    <span className="block truncate text-sm text-slate-600">{l.issue}</span>
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
        {plan === "free" && <Link to="/contractor/billing" className={buttonClass("primary", "mt-5 !rounded-full")}>Go Featured</Link>}
      </div>
    </>
  );
}
