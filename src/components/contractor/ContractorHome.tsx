import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { PageTitle, Panel, StatCard } from "@/components/admin/widgets";
import { buttonClass } from "@/components/ui/Button";
import { planName } from "@/config/pricing";
import { activePlan } from "@/lib/plans";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { ContractorLead } from "@/lib/types";
import { ClaimListing } from "./ClaimListing";
import { useContractor } from "./context";

export default function ContractorHome() {
  const { listing, claim } = useContractor();
  const [leads, setLeads] = useState<ContractorLead[] | null>(null);

  useEffect(() => {
    if (!listing) return;
    getSupabaseBrowser().rpc("my_leads").then(({ data }) => setLeads((data as ContractorLead[] | null) ?? []));
  }, [listing]);

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
  const newLeads = leads?.filter((l) => l.contractor_status === "new").length;
  const checklist = [
    { done: Boolean(listing.description && listing.description.length >= 40), label: "Write a description of your business", to: "/contractor/profile" },
    { done: listing.services.length > 0, label: "Choose the services you offer", to: "/contractor/profile" },
    { done: Boolean(listing.phone), label: "Add a phone number", to: "/contractor/profile" },
    { done: Boolean(listing.service_areas), label: "List the areas you serve", to: "/contractor/profile" },
    { done: plan !== "free", label: "Choose a Featured or Premium plan for top placement", to: "/contractor/billing" },
    { done: Boolean(listing.google_rating), label: "Add your Google star rating (Featured and Premium)", to: "/contractor/profile" },
  ];

  return (
    <>
      <PageTitle title={listing.business_name} />
      {listing.status !== "published" && (
        <p className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
          Your listing is <strong>{listing.status}</strong>, so it isn&apos;t public yet. We publish listings after a quick review; you can keep improving your profile meanwhile.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Current plan" value={planName(plan)} hint={plan === "free" ? "Upgrade for featured placement" : undefined} />
        <StatCard label="New requests" value={newLeads ?? "…"} hint="Assigned to you and not yet contacted" />
        <StatCard label="Listing status" value={<span className="capitalize">{listing.status}</span>} />
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
