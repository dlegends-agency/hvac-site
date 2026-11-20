import { Link, useSearchParams } from "react-router-dom";
import { PageTitle, Panel } from "@/components/admin/widgets";
import { MessageCenter } from "@/components/messages/MessageCenter";
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
  return (
    <>
      <PageTitle title="Messages" description="Your conversations with customers. Messaging opens for a request once you have unlocked it, and the lead status updates itself as you write." />
      <MessageCenter role="business" startLead={params.get("lead")} startListing={listing.id} upgradeHref="/contractor/leads" />
    </>
  );
}
