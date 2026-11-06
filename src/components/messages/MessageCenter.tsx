import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { MAX_MESSAGE, preview, sendError, type ChatMessage, type Conversation, type Role } from "@/lib/messages";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Props {
  role: Role;
  /** Open this request first, even if nothing has been said yet (the Message button on a request). */
  startLead?: string | null;
  startListing?: string | null;
  /** Where a business can read about upgrading. Shown to a business that cannot send. */
  upgradeHref?: string;
}

interface Row {
  lead_id: string;
  listing_id: string;
  business_name?: string;
  customer?: string;
  issue: string;
  city?: string;
  state?: string;
  can_send: boolean;
  last_body: string | null;
  last_sender: "business" | "customer" | null;
  last_at: string | null;
  unread: number;
}

const key = (c: Pick<Conversation, "lead_id" | "listing_id">) => `${c.lead_id}:${c.listing_id}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function toConversation(r: Row, role: Role): Conversation {
  return {
    lead_id: r.lead_id,
    listing_id: r.listing_id,
    title: (role === "customer" ? r.business_name : r.customer) ?? "Conversation",
    issue: r.issue,
    place: r.city ? `${r.city}, ${r.state ?? ""}` : undefined,
    can_send: r.can_send,
    last_body: r.last_body,
    last_sender: r.last_sender,
    last_at: r.last_at,
    unread: r.unread,
  };
}

/** The inbox and the open conversation. Used by customers (My account) and by businesses (contractor dashboard). */
export function MessageCenter({ role, startLead, startListing, upgradeHref }: Props) {
  const [list, setList] = useState<Conversation[] | null | "error">(null);
  const [open, setOpen] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data, error } = role === "customer"
      ? await supabase.rpc("my_conversations")
      : await supabase.rpc("business_conversations", { p_lead: startLead ?? null });
    if (error) return setList("error");
    const rows = ((data as Row[] | null) ?? []).map((r) => toConversation(r, role));
    setList(rows);
    setOpen((current) => {
      if (current) return current;
      const wanted = rows.find((c) => c.lead_id === startLead && (!startListing || c.listing_id === startListing));
      return wanted ? key(wanted) : null;
    });
  }, [role, startLead, startListing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void loadList();
  }, [loadList]);

  if (list === null) return <p className="flex items-center gap-2 text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>;
  if (list === "error") {
    return <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Messages couldn&apos;t be loaded. Make sure the latest <code>schema-messages.sql</code> has been run.</p>;
  }

  const current = list.find((c) => key(c) === open) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
      <section aria-label="Conversations" className={`${current ? "hidden md:block" : ""}`}>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            <MessageSquare className="mb-2 size-6 text-slate-400" aria-hidden />
            {role === "customer" ? (
              <p>No messages yet. When a Featured business that received your request writes to you, it shows up here. You can also message one from <Link to="/account" className="font-semibold text-primary underline">your requests</Link>.</p>
            ) : (
              <p>No messages yet. Open a request on the <Link to="/contractor/leads" className="font-semibold text-primary underline">Leads</Link> page and choose <strong>Message</strong> to write to a customer.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {list.map((c) => (
              <li key={key(c)}>
                <button type="button" onClick={() => setOpen(key(c))} aria-current={open === key(c) ? "true" : undefined}
                  className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${open === key(c) ? "bg-blue-50" : ""}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-navy">{c.title}</span>
                    {c.unread > 0 && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{c.issue}{c.place ? ` · ${c.place}` : ""}</span>
                  <span className={`mt-0.5 block truncate text-sm ${c.unread > 0 ? "font-semibold text-slate-900" : "text-slate-600"}`}>{preview(c, role)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Conversation" className={`${current ? "" : "hidden md:block"}`}>
        {current ? (
          <Thread key={key(current)} role={role} conversation={current} upgradeHref={upgradeHref} onBack={() => setOpen(null)} onChanged={loadList} />
        ) : (
          list.length > 0 && <div className="hidden rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 md:block">Choose a conversation.</div>
        )}
      </section>
    </div>
  );
}

function Thread({ role, conversation: c, upgradeHref, onBack, onChanged }: { role: Role; conversation: Conversation; upgradeHref?: string; onBack: () => void; onChanged: () => Promise<void> }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    const { data, error: err } = await getSupabaseBrowser().rpc("conversation_messages", { p_lead: c.lead_id, p_listing: c.listing_id });
    if (err) return;
    const rows = ((data as ChatMessage[] | null) ?? []).map((m) => ({ ...m, id: Number(m.id) }));
    setMessages(rows);
    if (rows.length !== count.current) {
      count.current = rows.length;
      void onChanged(); // opening a conversation marks it read, and new messages change the list
    }
  }, [c.lead_id, c.listing_id, onChanged]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseBrowser().rpc("send_message", { p_lead: c.lead_id, p_listing: c.listing_id, p_body: body });
    setBusy(false);
    if (err) return setError(sendError(err.message));
    setText("");
    await load();
  }

  return (
    <div className="flex h-[32rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations"><ArrowLeft className="size-5" aria-hidden /></button>
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-navy">{c.title}</h2>
          <p className="truncate text-xs text-slate-500">About: {c.issue}{c.place ? ` · ${c.place}` : ""}</p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4" role="log" aria-label="Messages" aria-live="polite">
        {messages === null && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>}
        {messages?.length === 0 && <p className="text-center text-sm text-slate-500">No messages yet. Say hello below.</p>}
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
              <p className="break-words whitespace-pre-line">{m.body}</p>
              <p className={`mt-1 text-[11px] ${m.mine ? "text-blue-100" : "text-slate-500"}`}>{when(m.created_at)}{m.mine && m.read_at ? " · Seen" : ""}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      {c.can_send ? (
        <form onSubmit={send} className="border-t border-slate-100 p-3">
          <label htmlFor="msg-body" className="sr-only">Your message</label>
          <textarea id="msg-body" rows={2} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit(); }}
            placeholder={role === "customer" ? "Write to this business…" : "Write to this customer…"} className={inputClass} />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{role === "business" ? "Don't share the customer's details outside this request." : "Please don't share card numbers or passwords."}</p>
            <Button type="submit" disabled={busy || !text.trim()} className="!rounded-full !px-5 !py-2 text-sm">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Send
            </Button>
          </div>
          <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}</div>
        </form>
      ) : (
        <p className="border-t border-slate-100 bg-amber-50 p-3 text-sm text-amber-900">
          {role === "business" ? (
            <>Sending messages is part of the Featured plan.{upgradeHref && <> <Link to={upgradeHref} className="font-semibold underline">See plans</Link>.</>}</>
          ) : (
            "This business can't take new messages right now. You can call them from your requests."
          )}
        </p>
      )}
    </div>
  );
}
