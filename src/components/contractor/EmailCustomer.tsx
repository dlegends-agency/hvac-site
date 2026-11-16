import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mail, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { MAX_MESSAGE, sendError } from "@/lib/messages";
import { getSupabaseBrowser } from "@/lib/supabase";
import { callApi } from "./api";

/**
 * The customer's email address as a button. Clicking it opens a window to write the message: it is sent through the site (never by the
 * contractor's own mail program), emailed to the customer by the site's email sender, and saved in the customer's dashboard where they can reply.
 */
export function EmailCustomer({ leadId, listingId, customerName, email, onSent }: { leadId: string; listingId: string; customerName: string; email: string; onSent?: () => void }) {
  const [open, setOpen] = useState(false);
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
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await getSupabaseBrowser().rpc("send_message", { p_lead: leadId, p_listing: listingId, p_body: body });
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

  return (
    <>
      <button type="button" onClick={show} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy shadow-sm hover:bg-slate-50">
        <Mail className="size-4" aria-hidden /> {email}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`Email ${customerName}`} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-navy">Email {customerName}</h2>
                <p className="mt-0.5 text-sm text-slate-600">To <strong>{email}</strong></p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" aria-hidden /></button>
            </div>

            {done ? (
              <div className="mt-5">
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
              <form onSubmit={send} className="mt-4">
                <label htmlFor="email-body" className="mb-1.5 block text-sm font-semibold text-navy">Your message</label>
                <textarea id="email-body" ref={box} rows={7} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} className={inputClass}
                  placeholder={`Hi ${customerName}, thanks for your request. I can come by…`} />
                <p className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>Sent from HVACHelp, not from your own email. The customer replies in their dashboard.</span>
                  <span>{text.length}/{MAX_MESSAGE}</span>
                </p>
                <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}</div>
                <div className="mt-4 flex items-center gap-2">
                  <Button type="submit" disabled={busy || text.trim().length === 0} className="!rounded-full !px-5 !py-2 text-sm">
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
