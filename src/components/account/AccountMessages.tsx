import { useSearchParams } from "react-router-dom";
import { MessageCenter } from "@/components/messages/MessageCenter";

/** The customer's inbox. ?lead=…&listing=… opens (or starts) the conversation with one business. */
export default function AccountMessages() {
  const [params] = useSearchParams();
  return (
    <>
      <p className="mb-5 max-w-3xl text-sm text-slate-700">
        Featured businesses that received your request can write to you here, and you can reply or write to them. Your phone number and email stay private unless you share them.
      </p>
      <MessageCenter role="customer" startLead={params.get("lead")} startListing={params.get("listing")} />
    </>
  );
}
