import { emailFailureHint } from "@/lib/email-hints";
import { sendError } from "@/lib/messages";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";
import { EmailComposer } from "./EmailComposer";

/** A starting subject line the contractor can change, for example "Your AC Not Turning On request". */
const defaultSubject = (issue: string) => {
  const first = issue.split(",")[0]?.trim() ?? "";
  return first ? `Your ${first} request` : "Your HVAC request";
};

/**
 * The customer's email address as a button. Clicking it opens an email window. The email is sent through the site (never by the contractor's
 * own mail program): it is saved in the customer's dashboard, where they reply, and the site emails it to them.
 */
export function EmailCustomer({ leadId, listingId, businessName, customerName, issue, email, onSent, label }: {
  leadId: string; listingId: string; businessName: string; customerName: string; issue: string; email: string; onSent?: (subject: string) => void;
  /** Show a button with this text instead of the address. */
  label?: string;
}) {
  return (
    <EmailComposer
      label={label}
      onSent={onSent}
      ai={{ kind: "lead", id: leadId }}
      address={email}
      to={`${customerName} <${email}>`}
      fromName={businessName}
      defaultSubject={defaultSubject(issue)}
      placeholder={`Hi ${customerName},\n\nThanks for your request. I can come by…\n\n${businessName}`}
      note="Sent from HVACHelp, not from your own email. The customer replies in their dashboard."
      onSend={async (subject, body) => {
        const { data, error } = await getSupabaseBrowser().rpc("send_message", { p_lead: leadId, p_listing: listingId, p_body: body, p_subject: subject });
        if (error) return { ok: false, error: sendError(error.message) };
        // The message is now in the customer's dashboard. Ask the site to email it too.
        const res = await callApi<{ emailed?: boolean; detail?: string }>("/api/messages/email", { messageId: Number(data) });
        const emailed = res.status === 200 && res.data.emailed === true;
        const hint = emailed ? "" : res.status === 501 ? "Site owner: email is not switched on yet (RESEND_API_KEY, NOTIFY_FROM_EMAIL)." : emailFailureHint(res.data.detail);
        return {
          ok: true,
          message: emailed
            ? "Sent. We emailed your message to the customer and saved it in their dashboard, where they can reply."
            : `Saved in the customer's dashboard, where they can read and reply. The email itself could not be sent right now, so they will see it next time they sign in.${hint ? ` ${hint}` : ""}`,
        };
      }}
    />
  );
}
