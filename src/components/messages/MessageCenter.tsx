import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, CheckCheck, Clock, ExternalLink, Inbox, Loader2, MapPin, MessageSquare, Search, Send, Sparkles } from "lucide-react";
import { callApi } from "@/components/contractor/api";
import { ContractorContext } from "@/components/contractor/context";
import { ago } from "@/components/contractor/useMyLeads";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { MAX_MESSAGE, preview, sendError, type ChatMessage, type Conversation, type Role } from "@/lib/messages";
import { activePlan } from "@/lib/plans";
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

type Filter = "all" | "unread" | "reply" | "waiting";
const key = (c: Pick<Conversation, "lead_id" | "listing_id">) => `${c.lead_id}:${c.listing_id}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayName = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const initials = (s: string) => s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

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

/** Whose turn it is. "reply" = the other side wrote last, so it is waiting on you. */
const turn = (c: Conversation, role: Role): "none" | "reply" | "waiting" => (!c.last_sender ? "none" : c.last_sender === (role === "business" ? "business" : "customer") ? "waiting" : "reply");

const Tile = ({ label, value, hint, tone }: { label: string; value: number | string; hint: string; tone: string }) => (
  <div className={`rounded-2xl border p-3.5 ${tone}`}><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-0.5 text-2xl font-extrabold text-navy">{value}</p><p className="text-xs text-slate-600">{hint}</p></div>
);

/** The inbox and the open conversation. Used by customers (My account) and by businesses (contractor dashboard). */
export function MessageCenter({ role, startLead, startListing, upgradeHref }: Props) {
  const [list, setList] = useState<Conversation[] | null | "error">(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

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
    const timer = window.setInterval(() => void loadList(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadList]);

  const rows = useMemo(() => (Array.isArray(list) ? list : []), [list]);
  const stats = useMemo(() => ({
    unread: rows.reduce((s, c) => s + c.unread, 0),
    reply: rows.filter((c) => turn(c, role) === "reply").length,
    waiting: rows.filter((c) => turn(c, role) === "waiting").length,
  }), [rows, role]);
  const q = search.trim().toLowerCase();
  const shown = rows.filter((c) =>
    (filter === "all" || (filter === "unread" && c.unread > 0) || (filter === "reply" && turn(c, role) === "reply") || (filter === "waiting" && turn(c, role) === "waiting"))
    && (!q || `${c.title} ${c.issue} ${c.place ?? ""} ${c.last_body ?? ""}`.toLowerCase().includes(q)));

  if (list === null) return <p className="flex items-center gap-2 text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>;
  if (list === "error") {
    return <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Messages couldn&apos;t be loaded. Make sure the latest <code>schema-messages.sql</code> has been run.</p>;
  }

  const current = rows.find((c) => key(c) === open) ?? null;
  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: rows.length },
    { id: "unread", label: "Unread", n: rows.filter((c) => c.unread > 0).length },
    { id: "reply", label: role === "business" ? "Needs your reply" : "They replied", n: stats.reply },
    { id: "waiting", label: role === "business" ? "Waiting on them" : "Waiting on them", n: stats.waiting },
  ];

  return (
    <>
      {role === "business" && rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Unread" value={stats.unread} hint="New messages" tone={stats.unread ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"} />
          <Tile label="Needs your reply" value={stats.reply} hint="The customer wrote last" tone={stats.reply ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"} />
          <Tile label="Waiting on customers" value={stats.waiting} hint="You wrote last" tone="border-slate-200 bg-white" />
          <Tile label="Conversations" value={rows.length} hint="All requests with messages" tone="border-slate-200 bg-white" />
        </div>
      )}

      <div className={`grid gap-4 ${role === "business" ? "md:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_16rem]" : "md:grid-cols-[19rem_minmax(0,1fr)]"}`}>
        <section aria-label="Conversations" className={`min-w-0 ${current ? "hidden md:block" : ""}`}>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              <MessageSquare className="mb-2 size-6 text-slate-400" aria-hidden />
              {role === "customer" ? (
                <p>No messages yet. When a business that received your request unlocks it and writes to you, it shows up here.</p>
              ) : (
                <p>No messages yet. Unlock a request in <Link to="/contractor/my-leads" className="font-semibold text-primary underline">My Leads</Link>, then email the customer. The conversation appears here.</p>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="space-y-2 border-b border-slate-100 p-3">
                <label className="relative block">
                  <span className="sr-only">Search messages</span>
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages" className="w-full rounded-full border border-slate-300 bg-white py-1.5 pr-3 pl-9 text-sm" />
                </label>
                <div role="tablist" aria-label="Filter conversations" className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => (
                    <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${filter === f.id ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {f.label}{f.n > 0 && f.id !== "all" ? ` ${f.n}` : ""}
                    </button>
                  ))}
                </div>
              </div>
              {shown.length === 0 ? <p className="p-5 text-center text-sm text-slate-500">Nothing matches.</p> : (
                <ul className="max-h-[calc(100dvh-22rem)] min-h-40 divide-y divide-slate-100 overflow-y-auto">
                  {shown.map((c) => {
                    const t = turn(c, role);
                    return (
                      <li key={key(c)}>
                        <button type="button" onClick={() => setOpen(key(c))} aria-current={open === key(c) ? "true" : undefined}
                          className={`flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-slate-50 ${open === key(c) ? "bg-blue-50" : ""}`}>
                          <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${c.unread > 0 ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`} aria-hidden>{initials(c.title)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className={`truncate text-sm ${c.unread > 0 ? "font-bold text-navy" : "font-semibold text-navy"}`}>{c.title}</span>
                              {c.last_at && <span className="shrink-0 text-[11px] text-slate-500">{ago(c.last_at)}</span>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">{c.issue}{c.place ? ` · ${c.place}` : ""}</span>
                            <span className="mt-0.5 flex items-center justify-between gap-2">
                              <span className={`truncate text-sm ${c.unread > 0 ? "font-semibold text-slate-900" : "text-slate-600"}`}>{preview(c, role)}</span>
                              {c.unread > 0 ? <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>
                                : t === "reply" && role === "business" ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">Reply</span> : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <section aria-label="Conversation" className={`min-w-0 md:col-span-1 ${current ? "md:contents" : "hidden md:block"}`}>
          {current ? (
            <Thread key={key(current)} role={role} conversation={current} upgradeHref={upgradeHref} onBack={() => setOpen(null)} onChanged={loadList} />
          ) : (
            rows.length > 0 && (
              <div className="hidden h-full min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center md:flex xl:col-span-2">
                <Inbox className="mb-2 size-8 text-slate-300" aria-hidden />
                <p className="font-semibold text-navy">Choose a conversation</p>
                <p className="mt-1 text-sm text-slate-500">{stats.reply > 0 && role === "business" ? `${stats.reply} ${stats.reply === 1 ? "customer is" : "customers are"} waiting for your reply.` : "Pick one on the left to read it and reply."}</p>
              </div>
            )
          )}
        </section>
      </div>
    </>
  );
}

function Thread({ role, conversation: c, upgradeHref, onBack, onChanged }: { role: Role; conversation: Conversation; upgradeHref?: string; onBack: () => void; onChanged: () => Promise<void> }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const business = useContext(ContractorContext)?.listing;
  const canDraft = role === "business" && Boolean(business) && activePlan(business as NonNullable<typeof business>) !== "free";

  const load = useCallback(async () => {
    const { data, error: err } = await getSupabaseBrowser().rpc("conversation_messages", { p_lead: c.lead_id, p_listing: c.listing_id });
    if (err) {
      setLoadError(err.message || "unknown error");
      return;
    }
    setLoadError(null);
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
    const { data: sentId, error: err } = await getSupabaseBrowser().rpc("send_message", { p_lead: c.lead_id, p_listing: c.listing_id, p_body: body });
    if (err) {
      setBusy(false);
      return setError(sendError(err.message));
    }
    // A message from a business is also emailed to the customer by the site (the customer's address never reaches the browser).
    if (role === "business" && sentId) await callApi("/api/messages/email", { messageId: Number(sentId) });
    setBusy(false);
    setText("");
    await load();
  }

  /** The AI reads this thread (as you, so it sees only what you can) and writes a reply to edit. It never sends. */
  async function draftReply() {
    setDrafting(true);
    setError(null);
    const res = await callApi<{ body?: string }>("/api/assistant/draft", { kind: "lead", id: c.lead_id, purpose: "reply", note: text.trim().slice(0, 600) });
    setDrafting(false);
    if (res.status === 200 && res.data.body) setText(res.data.body.slice(0, MAX_MESSAGE));
    else setError(res.status === 501 ? "The AI Assistant is not switched on yet." : (res.error ?? "The assistant could not write a reply. Please try again."));
  }

  const first = c.title.split(" ")[0] || "there";
  const quick = [
    { label: "Say thanks", text: `Hi ${first}, thanks for reaching out. I can help with this. When would be a good time to talk or come by?` },
    { label: "Ask for details", text: `Hi ${first}, could you tell me a little more? What is the make and age of the system, and when did the problem start?` },
    { label: "Offer a visit", text: `Hi ${first}, I can come by on [day] at [time] to take a look. Does that work for you?` },
  ];
  const dayRows = useMemo(() => {
    const out: ({ kind: "day"; label: string } | { kind: "msg"; m: ChatMessage; tail: boolean })[] = [];
    let last = "";
    (messages ?? []).forEach((m, i, all) => {
      const label = dayName(m.created_at);
      if (label !== last) { out.push({ kind: "day", label }); last = label; }
      out.push({ kind: "msg", m, tail: all[i + 1]?.mine !== m.mine || dayName(all[i + 1].created_at) !== label });
    });
    return out;
  }, [messages]);

  return (
    <>
      <div className="flex h-[calc(100dvh-14rem)] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <button type="button" onClick={onBack} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations"><ArrowLeft className="size-5" aria-hidden /></button>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>{initials(c.title)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-navy">{c.title}</h2>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500"><span className="truncate">About: {c.issue}</span>{c.place && <><span aria-hidden>·</span><MapPin className="size-3 shrink-0" aria-hidden /><span className="truncate">{c.place}</span></>}</p>
          </div>
          {role === "business" && <Link to="/contractor/my-leads" className="hidden items-center gap-1 text-xs font-semibold text-primary hover:underline sm:inline-flex xl:hidden">My Leads <ExternalLink className="size-3" aria-hidden /></Link>}
        </header>

        <div className="min-w-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto bg-slate-50 px-4 py-4" role="log" aria-label="Messages" aria-live="polite">
          {messages === null && !loadError && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>}
          {loadError && (
            <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <p>This conversation couldn&apos;t be loaded. Make sure the latest <code>schema-messages.sql</code> has been run.</p>
              <p className="mt-1 text-xs break-words text-orange-800">Details: {loadError}</p>
              <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline">Try again</button>
            </div>
          )}
          {messages?.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No messages yet. Say hello below.</p>}
          {dayRows.map((r, i) => r.kind === "day" ? (
            <p key={`d${i}`} className="py-2 text-center text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{r.label}</p>
          ) : (
            <div key={r.m.id} className={`flex ${r.m.mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${r.m.mine ? `bg-primary text-white ${r.tail ? "rounded-br-md" : ""}` : `border border-slate-200 bg-white text-slate-800 ${r.tail ? "rounded-bl-md" : ""}`}`}>
                {(r.tail || r.m.subject) && !r.m.mine && <p className="mb-0.5 text-xs font-semibold break-all text-navy">{r.m.sender_name}</p>}
                {r.m.subject && <p className="mb-1 text-sm font-bold break-words">{r.m.subject}</p>}
                <p className="break-words whitespace-pre-line">{r.m.body}</p>
                <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${r.m.mine ? "text-blue-100" : "text-slate-500"}`}>
                  {clock(r.m.created_at)}{r.m.mine && (r.m.read_at ? <CheckCheck className="size-3.5" aria-label="Seen" /> : <Check className="size-3.5" aria-label="Sent" />)}
                </p>
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>

        {c.can_send ? (
          <form onSubmit={send} className="border-t border-slate-100 p-3">
            {role === "business" && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {canDraft && (
                  <button type="button" onClick={() => void draftReply()} disabled={drafting || busy} className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60">
                    {drafting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} {drafting ? "Writing…" : "Reply with AI"}
                  </button>
                )}
                {quick.map((qr) => <button key={qr.label} type="button" onClick={() => setText(qr.text)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">{qr.label}</button>)}
              </div>
            )}
            <label htmlFor="msg-body" className="sr-only">Your message</label>
            <textarea id="msg-body" rows={2} maxLength={MAX_MESSAGE} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit(); }}
              placeholder={role === "customer" ? "Write to this business…" : "Write to this customer…"} className={`${inputClass} [field-sizing:content] max-h-48`} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{role === "business" ? "Ctrl+Enter sends. Don't share the customer's details outside this request." : "Please don't share card numbers or passwords."}</p>
              <Button type="submit" disabled={busy || !text.trim()} className="!rounded-full !px-5 !py-2 text-sm">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Send
              </Button>
            </div>
            <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}</div>
          </form>
        ) : (
          <p className="border-t border-slate-100 bg-amber-50 p-3 text-sm text-amber-900">
            {role === "business" ? (
              <>Messaging is locked. Unlock this request to message the customer.{upgradeHref && <> <Link to={upgradeHref} className="font-semibold underline">Go to your requests</Link>.</>}</>
            ) : (
              "This business hasn't unlocked your request yet, so messaging isn't open. You can call them from your requests."
            )}
          </p>
        )}
      </div>

      {role === "business" && (
        <aside aria-label="About this request" className="hidden space-y-3 xl:block">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Customer</p>
            <p className="mt-1 font-semibold text-navy">{c.title}</p>
            <p className="mt-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">Request</p>
            <p className="mt-0.5 text-sm text-slate-800">{c.issue}</p>
            {c.place && <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPin className="size-3.5 text-slate-400" aria-hidden /> {c.place}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600"><Clock className="size-3.5 text-slate-400" aria-hidden /> {c.last_at ? `Last message ${ago(c.last_at)}` : "No messages yet"}</p>
            <Link to="/contractor/my-leads" className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-slate-50">Open in My Leads <ExternalLink className="size-3.5" aria-hidden /></Link>
          </div>
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">The status of this lead moves on its own: your first message sets it to Contacted, a proposal subject to Quote sent, and a customer asking for a price to Interested.</p>
        </aside>
      )}
    </>
  );
}
