import { callApi } from "./api";
import { EmailComposer } from "./EmailComposer";

/**
 * The contact's email address on an unlocked building permit or government bid, as a button that opens the email window. The email is sent
 * through the site. The browser only says which contact (its position on the lead): the server reads the address itself, and checks the
 * lead is unlocked, the daily limits and the opt-out list. Replies go straight to the business.
 */
export function EmailOpportunity({ kind, itemId, index, email, recipient, businessName, defaultSubject }: {
  kind: "permit" | "bid";
  itemId: string;
  index: number;
  email: string;
  /** The person or company the email is to, for the To line. */
  recipient: string;
  businessName: string;
  defaultSubject: string;
}) {
  return (
    <EmailComposer
      address={email}
      to={`${recipient} <${email}>`}
      fromName={businessName}
      defaultSubject={defaultSubject}
      placeholder={`Hello ${recipient.split(" ")[0] || ""},\n\nI am writing from ${businessName}…\n\n${businessName}`}
      note="Sent from HVACHelp. Replies come straight to your business email. Please only write about this job."
      onSend={async (subject, body) => {
        const res = await callApi<{ sent?: boolean }>("/api/opportunities/email", { kind, itemId, index, subject, body });
        if (res.status === 200 && res.data.sent) return { ok: true, message: `Sent to ${recipient}. If they reply, it comes straight to your business email.` };
        if (res.status === 501) return { ok: false, error: "Email is not switched on yet. Please contact us." };
        return { ok: false, error: res.error ?? "We could not send that. Please try again." };
      }}
    />
  );
}
