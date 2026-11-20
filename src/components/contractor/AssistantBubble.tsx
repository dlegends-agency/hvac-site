import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Loader2, MailCheck, Send, Sparkles, X } from "lucide-react";
import { activePlan } from "@/lib/plans";
import { callApi } from "./api";
import { useContractor } from "./context";

interface Draft { kind: "lead" | "permit" | "bid"; id: string; subject: string; body: string }
interface Turn { role: "user" | "assistant"; content: string; drafts?: Draft[]; emailed?: boolean; error?: boolean }

const KIND_LABEL = { lead: "Reply to customer", permit: "Email for building permit", bid: "Email for government bid" } as const;
const WHERE = { lead: "Customer requests", permit: "Leads > Building permits", bid: "Leads > Government bids" } as const;
const SUGGESTIONS = [
  "What is new today?",
  "Email me a report of my new leads",
  "Draft a reply to my newest customer request",
  "Draft a proposal email for my best government bid",
  "Write a separate email for a building permit",
];

function DraftCard({ draft }: { draft: Draft }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copying is a convenience; the text is on screen */
    }
  }
  return (
    <div className="mt-2 rounded-xl border border-violet-200 bg-white p-3 text-slate-800">
      <p className="text-[11px] font-bold tracking-wide text-violet-700 uppercase">{KIND_LABEL[draft.kind]}</p>
      <p className="mt-1 text-sm font-semibold break-words">{draft.subject}</p>
      <p className="mt-1 text-sm break-words whitespace-pre-line">{draft.body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {copied ? <Check className="size-3.5 text-green-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copied" : "Copy"}
        </button>
        <span className="text-[11px] text-slate-500">To send it: open it under {WHERE[draft.kind]} and press <strong>Draft with AI</strong> in the email window.</span>
      </div>
    </div>
  );
}

/** The chat bubble in the contractor dashboard. Featured businesses chat with the AI Assistant; everyone else sees what it does and how to get it. */
export function AssistantBubble() {
  const { listing } = useContractor();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const featured = Boolean(listing && activePlan(listing) !== "free");

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns.length, busy, open]);

  // The dashboard's assistant card opens this chat, optionally with a question already typed in.
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const t = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (t) setText(t);
    };
    window.addEventListener("open-assistant", onOpen);
    return () => window.removeEventListener("open-assistant", onOpen);
  }, []);

  if (!listing) return null;

  async function send(message: string) {
    const content = message.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    setBusy(true);
    const res = await callApi<{ reply?: string; drafts?: Draft[]; emailed?: boolean }>("/api/assistant/chat", {
      messages: next.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content })),
    });
    setBusy(false);
    if (res.status === 200 && res.data.reply) {
      setTurns([...next, { role: "assistant", content: res.data.reply, drafts: res.data.drafts, emailed: res.data.emailed }]);
    } else {
      const why = res.status === 501 ? "The AI Assistant is not switched on yet. Please contact us." : res.status === 0 ? "No connection. Please try again." : res.error ?? "The assistant could not answer. Please try again.";
      setTurns([...next, { role: "assistant", content: why, error: true }]);
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <div role="dialog" aria-label="AI Assistant" className="flex h-[min(34rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between gap-3 bg-violet-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5" aria-hidden />
              <div>
                <p className="text-sm leading-tight font-bold">AI Assistant</p>
                <p className="text-[11px] leading-tight text-violet-100">Reports, and emails for requests, permits and bids</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close the assistant" className="rounded-lg p-1 hover:bg-violet-600"><X className="size-5" aria-hidden /></button>
          </header>

          {!featured ? (
            <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-700">
              <p className="font-semibold text-navy">The AI Assistant comes with the Featured plan.</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>Chat about your new requests, permits and bids.</li>
                <li>Get a report sent to your email.</li>
                <li>Draft a reply to a customer request.</li>
                <li>Draft a formal email for a government bid.</li>
                <li>Draft a separate email for a building permit.</li>
              </ul>
              <Link to="/contractor/billing" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90">Go Featured</Link>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" role="log" aria-label="Assistant conversation" aria-live="polite">
                {turns.length === 0 && (
                  <div className="text-sm text-slate-700">
                    <p>Hi! I can see your customer requests, building permits and government bids. Ask me anything, or try:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-violet-800 hover:bg-violet-50">{s}</button>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500">I never see customers&apos; phone numbers or email addresses. Check my drafts before you send them.</p>
                  </div>
                )}
                {turns.map((t, i) => (
                  <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-sm ${t.role === "user" ? "bg-violet-700 text-white" : t.error ? "border border-red-200 bg-red-50 text-red-800" : "border border-slate-200 bg-white text-slate-800"}`}>
                      <p className="break-words whitespace-pre-line">{t.content}</p>
                      {t.emailed && <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-green-700"><MailCheck className="size-3.5" aria-hidden /> Report sent to your email</p>}
                      {t.drafts?.map((d, j) => <DraftCard key={j} draft={d} />)}
                    </div>
                  </div>
                ))}
                {busy && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…</p>}
                <div ref={end} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex items-end gap-2 border-t border-slate-100 p-3">
                <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
                <textarea id="assistant-input" rows={1} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
                  placeholder="Ask the assistant…" className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500" />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50">
                  <Send className="size-4" aria-hidden />
                </button>
              </form>
            </>
          )}
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Close the AI Assistant" : "Open the AI Assistant"}
        className="flex items-center gap-2 rounded-full bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-800">
        {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
        <span className={open ? "sr-only sm:not-sr-only" : ""}>{open ? "Close" : "AI Assistant"}</span>
      </button>
    </div>
  );
}
