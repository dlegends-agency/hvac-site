import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mail, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { MAX_MESSAGE, MAX_SUBJECT, sendError } from "@/lib/messages";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";

/** A starting subject line the contractor can change, for example "Your AC Not Turning On request". */
const defaultSubject = (issue: string) => {
  const first = issue.split(",")[0]?.trim() ?? "";
  return first ? `Your ${first} request` : "Your HVAC request";
};

/**
 * The customer's email address as a button. Clicking it opens an email window (To, From, Subject, message). The email is sent through the site
 * (never by the contractor's own mail program): the site emails it to the customer and saves it in the customer's dashboard, where they reply.
 */
export function EmailCustomer({ leadId, listingId, businessName, customerName, issue, email, onSent }: {
  leadId: string; listingId: string; businessName: string; customerName: string; issue: string; email: string; onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(() => defaultSubject(issue));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ emailed: boolean } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function show() {
    setDone(null);
    setError(null);
    setOpen(true);
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !subject.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await getSupabaseBrowser().rpc("send_message", { p_lead: leadId, p_listing: listingId, p_body: body, p_subject: subject.trim() });
    if (err) {
      setBusy(false);
      return setError(sendError(err.message));
    }
    // The message is now in the customer's dashboard. Ask the site to email it too.
    const res = await callApi<{ emailed?: boolean }>("/api/messages/email", { messageId: Number(data) });
    setBusy(false);
    setText("");
    setDone({ emailed: res.status === 200 && res.data.emailed === true });
    onSent?.();
  }

  const row = "flex items-baseline gap-3 border-b border-slate-200 py-2 text-sm";
  const label = "w-16 shrink-0 text-xs font-semibold text-slate-500 uppercase";

  return (
    <>
      <button type="button" onClick={show} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy shadow-sm hover:bg-slate-50">
        <Mail className="size-4" aria-hidden /> {email}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Email ${customerName}`} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-navy"><Mail className="size-4 text-primary" aria-hidden /> New email</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"><X className="size-5" aria-hidden /></button>
            </div>

            {done ? (
              <div className="p-5">
                <p role="status" className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {done.emailed
                      ? "Sent. We emailed your message to the customer and saved it in their dashboard, where they can reply."
                      : "Saved in the customer's dashboard, where they can read and reply. The email itself could not be sent right now, so they will see it next time they sign in."}
                  </span>
                </p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => setOpen(false)} className="!rounded-full !px-5 !py-2 text-sm">Done</Button>
                  <Button variant="secondary" onClick={() => setDone(null)} className="!rounded-full !px-5 !py-2 text-sm">Write another</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={send} className="px-5 pt-1 pb-5">
                <div className={row}><span className={label}>To</span><span className="min-w-0 break-all text-slate-900">{customerName} &lt;{email}&gt;</span></div>
                <div className={row}><span className={label}>From</span><span className="min-w-0 text-slate-900">{businessName} via HVACHelp</span></div>
                <div className={row}>
                  <label htmlFor="email-subject" className={label}>Subject</label>
                  <input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} required
                    className="min-w-0 flex-1 bg-transparent font-medium text-slate-900 outline-none placeholder:text-slate-400 focus-visible:text-primary" placeholder="What is this about?" />
                </div>
                <label htmlFor="email-body" className="sr-only">Message</label>
                <textarea id="email-body" ref={box} rows={9} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} mt-3`}
                  placeholder={`Hi ${customerName},\n\nThanks for your request. I can come by…\n\n${businessName}`} />
                <p className="mt-1 flex justify-between gap-3 text-xs text-slate-500">
                  <span>Sent from HVACHelp, not from your own email. The customer replies in their dashboard.</span>
                  <span className="shrink-0">{text.length}/{MAX_MESSAGE}</span>
                </p>
                <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}</div>
                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" disabled={busy || text.trim().length === 0 || subject.trim().length === 0} className="!rounded-full !px-5 !py-2 text-sm">
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Send email
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy} className="!rounded-full !px-5 !py-2 text-sm">Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
