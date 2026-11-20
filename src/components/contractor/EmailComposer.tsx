import { useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mail, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { MAX_MESSAGE, MAX_SUBJECT } from "@/lib/messages";
import { activePlan } from "@/lib/plans";
import { callApi } from "./api";
import { ContractorContext } from "./context";

export type SendResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The email window: To, From, Subject and the message, like a real email. One component for every place a business emails someone from the
 * site (a customer, the contractor on a permit, the contracting officer on a bid). The button that opens it is the address itself.
 * `onSend` does the sending and says what happened; this component only collects the subject and message and shows the result.
 */
export function EmailComposer({ address, label, to, fromName, defaultSubject, placeholder, note, onSend, onSent, ai }: {
  /** Called after an email was sent, with its subject (for example to log it on the lead's timeline). */
  onSent?: (subject: string) => void;
  /** Which lead, permit or bid this email is about. Featured businesses get a "Draft with AI" button that writes the first draft for it. */
  ai?: { kind: "lead" | "permit" | "bid"; id: string; index?: number };
  /** The address shown on the button that opens the window. */
  address: string;
  /** When given, the button that opens the window is a solid button with this text (for example "Send Project Email Proposal") instead of the address. */
  label?: string;
  /** Who it is to, as shown in the To line, for example "Chelsea <chelsea@example.com>". */
  to: string;
  fromName: string;
  defaultSubject: string;
  placeholder: string;
  /** A line under the message box about where replies go. */
  note: string;
  onSend: (subject: string, body: string) => Promise<SendResult>;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const business = useContext(ContractorContext)?.listing;
  const canDraft = Boolean(ai && business && activePlan(business) !== "free");
  const [drafting, setDrafting] = useState(false);
  const [purpose, setPurpose] = useState<"first" | "reply" | "proposal" | "contract">("first");

  async function draftWithAi() {
    if (!ai || drafting) return;
    setDrafting(true);
    setError(null);
    const res = await callApi<{ subject?: string; body?: string; detail?: string }>("/api/assistant/draft", { ...ai, purpose, note: text.trim().slice(0, purpose === "first" ? 300 : 1500) });
    setDrafting(false);
    if (res.status === 200 && res.data.subject && res.data.body) {
      setSubject(res.data.subject);
      setText(res.data.body);
      box.current?.focus();
    } else setError(res.status === 501 ? "The AI Assistant is not switched on yet. Please contact us." : `${res.error ?? "The assistant could not write a draft. Please try again."}${res.data.detail ? ` (Site owner: ${res.data.detail})` : ""}`);
  }

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !subject.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await onSend(subject.trim(), body);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setText("");
    setDone(result.message);
    onSent?.(subject.trim());
  }

  const row = "flex items-baseline gap-3 border-b border-slate-200 py-2 text-sm";
  const fieldLabel = "w-16 shrink-0 text-xs font-semibold text-slate-500 uppercase";

  return (
    <>
      <button type="button" onClick={() => { setDone(null); setError(null); setOpen(true); }}
        className={label
          ? "inline-flex items-center gap-1.5 rounded-full border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary hover:bg-blue-50"
          : "inline-flex max-w-full items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy shadow-sm hover:bg-slate-50"}>
        {label ? <><Send className="size-4 shrink-0" aria-hidden /> {label}</> : <><Mail className="size-4 shrink-0" aria-hidden /> <span className="min-w-0 break-all">{address}</span></>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="New email" onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-navy"><Mail className="size-4 text-primary" aria-hidden /> New email</h2>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"><X className="size-5" aria-hidden /></button>
            </div>

            {done ? (
              <div className="p-5">
                <p role="status" className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{done}</span>
                </p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => setOpen(false)} className="!rounded-full !px-5 !py-2 text-sm">Done</Button>
                  <Button variant="secondary" onClick={() => setDone(null)} className="!rounded-full !px-5 !py-2 text-sm">Write another</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={send} className="px-5 pt-1 pb-5">
                <div className={row}><span className={fieldLabel}>To</span><span className="min-w-0 break-all text-slate-900">{to}</span></div>
                <div className={row}><span className={fieldLabel}>From</span><span className="min-w-0 text-slate-900">{fromName} via HVACHelp</span></div>
                <div className={row}>
                  <label htmlFor="email-subject" className={fieldLabel}>Subject</label>
                  <input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} required
                    className="min-w-0 flex-1 bg-transparent font-medium text-slate-900 outline-none placeholder:text-slate-400 focus-visible:text-primary" placeholder="What is this about?" />
                </div>
                <label htmlFor="email-body" className="sr-only">Message</label>
                <textarea id="email-body" ref={box} rows={9} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} mt-3`} placeholder={placeholder} />
                {canDraft && (
                  <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/60 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Sparkles className="size-4 text-violet-700" aria-hidden />
                      <label htmlFor="email-ai-purpose" className="sr-only">What should the AI write?</label>
                      <select id="email-ai-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)} disabled={drafting || busy}
                        className="rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-violet-900">
                        <option value="first">Write the first email</option>
                        <option value="reply">Reply to their message</option>
                        <option value="proposal">Write a proposal email</option>
                        <option value="contract">Draft a service agreement</option>
                      </select>
                      <button type="button" onClick={draftWithAi} disabled={drafting || busy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-white px-3 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60">
                        {drafting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
                        {drafting ? "Writing…" : text.trim() ? "Rewrite with AI" : "Draft with AI"}
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">
                      {purpose === "reply" ? "Customer requests: the AI reads your thread. Otherwise paste their message in the box first."
                        : purpose === "first" ? "Anything you type in the box is used as a note to the AI."
                        : "Type the price, dates and terms in the box first. Anything missing is left as a [placeholder]."} You read and edit it before it is sent. The AI never sends anything.
                    </p>
                  </div>
                )}
                <p className="mt-1 flex justify-between gap-3 text-xs text-slate-500">
                  <span>{note}</span>
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
