import { Link, useSearchParams } from "react-router-dom";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { MessageCenter } from "@/components/messages/MessageCenter";
import { activePlan } from "@/lib/plans";
import { useContractor } from "./context";

/** Conversations with customers. ?lead=… opens (or starts) the conversation about one request. */
export default function ContractorMessages() {
  const { listing } = useContractor();
  const [params] = useSearchParams();

  if (!listing) {
    return (
      <>
        <PageTitle title="Messages" />
        <Panel title="Not connected yet"><p className="text-sm text-slate-700">Connect your business on the <Link to="/contractor" className="font-semibold text-primary underline">dashboard</Link> first.</p></Panel>
      </>
    );
  }
  const paid = activePlan(listing) !== "free";

  return (
    <>
      <PageTitle title="Messages" />
      <p className="mb-5 max-w-3xl text-sm text-slate-700">
        Write to customers who sent you a request, and read their replies. Messages stay on HVACHelp, so the customer&apos;s phone and email stay private until you unlock the request.
        {!paid && <> Sending messages is part of the Featured plan. <Link to="/contractor/billing" className="font-semibold text-primary underline">See plans</Link>.</>}
      </p>
      <MessageCenter role="business" startLead={params.get("lead")} startListing={listing.id} upgradeHref="/contractor/billing" />
    </>
  );
}
