import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarDays, Check, Loader2, MapPin, Receipt as ReceiptIcon, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { BOOKING_TYPE_LABEL, dateLabel, timeLabel } from "@/lib/bookings";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useBookings } from "./useBookings";
import { ACTIVITY_LABEL, day, money, type Activity, type Contact, type Receipt, type ThreadMessage } from "./leadRecord";
import { KIND_LABEL, KIND_STYLE, STAGE_LABEL, STAGE_STYLE, type HubItem, type PipelineRow } from "./useLeadHub";
import { ago } from "./useMyLeads";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex gap-2 text-sm"><dt className="w-24 shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 flex-1 break-words text-slate-800">{children}</dd></div>;
}
const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-xl bg-slate-50 p-3.5"><h3 className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">{title}</h3>{children}</section>
);

/**
 * The whole record of one lead in a window on top of the My Leads page, so nothing opens on another page: contact, the opportunity in full,
 * the payment, the bookings, the activity timeline and the conversation (the customer's messages for a request, or replies you log here).
 */
export function LeadRecordModal({ r, item, contact, description, receipt, plan, listingId, onClose, onChanged }: {
  r: PipelineRow; item: HubItem; contact: Contact; description: string; receipt: Receipt | null; plan: string; listingId: string; onClose: () => void; onChanged: () => void;
}) {
  const [timeline, setTimeline] = useState<Activity[] | null>(null);
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const bookings = useBookings(true);
  const mine = (bookings.rows ?? []).filter((b) => b.lead_kind === r.kind && b.lead_item_id === r.item_id && b.status !== "cancelled");

  const loadTimeline = useCallback(async () => {
    const { data } = await getSupabaseBrowser().rpc("my_lead_activities", { p_kind: r.kind, p_item: r.item_id });
    setTimeline((data as Activity[] | null) ?? []);
  }, [r.kind, r.item_id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the window opens
    void loadTimeline();
    if (r.kind !== "lead") return;
    void (async () => {
      const { data } = await getSupabaseBrowser().from("lead_messages").select("id, sender, body, subject, created_at").eq("lead_id", r.item_id).eq("listing_id", listingId).order("id", { ascending: true }).limit(100);
      setThread((data as ThreadMessage[] | null) ?? []);
    })();
  }, [r.kind, r.item_id, listingId, loadTimeline]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function logReply() {
    if (!reply.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await getSupabaseBrowser().rpc("log_inbound_reply", { p_kind: r.kind, p_item: r.item_id, p_body: reply.trim() });
    setBusy(false);
    if (error) return setMsg(error.message.includes("function") ? "Run supabase/schema-bookings.sql first." : error.message);
    setReply("");
    setMsg(data === true ? "They asked for a quotation, so the status moved to Interested." : "Reply saved on the timeline.");
    void loadTimeline();
    onChanged();
  }

  const paid = receipt && (receipt.unlock_cents ?? 0) > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-3 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Full record: ${item.subject}`} onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${KIND_STYLE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STAGE_STYLE[r.stage]}`}>{STAGE_LABEL[r.stage]}</span>
              {r.follow_up_on && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Follow up {day(r.follow_up_on)}</span>}
            </p>
            <h2 className="mt-1.5 text-lg font-bold text-navy">{item.subject}</h2>
            <p className="text-sm text-slate-600">{item.place}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"><X className="size-5" aria-hidden /></button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Block title="Contact">
              <dl className="space-y-1.5">
                <Row label="Name">{contact.name ?? "Not listed"}</Row>
                <Row label="Company">{contact.company ?? "Not listed"}</Row>
                {contact.position && <Row label="Position">{contact.position}</Row>}
                <Row label="Phone">{contact.phone ? <a href={`tel:${contact.phone}`} className="font-semibold text-primary hover:underline">{contact.phone}</a> : "Not listed"}</Row>
                <Row label="Email"><span className="break-all">{contact.email ?? "Not listed"}</span></Row>
              </dl>
            </Block>
            <Block title="Opportunity">
              {description && <p className="mb-2 text-sm whitespace-pre-line text-slate-800">{description}</p>}
              <dl className="space-y-1.5">
                <Row label="Industry">{item.industry} · {item.trade}</Row>
                <Row label="Location"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-slate-400" aria-hidden /> {item.place || "Not listed"}</span></Row>
                <Row label="Est. value">{money(item.value)}{item.value === null && item.fact ? ` · ${item.fact}` : ""}</Row>
                <Row label="Source">{item.source}</Row>
                {item.when && <Row label="Discovered">{day(item.when)}</Row>}
                {r.amount_usd !== null && <Row label="Your quote">{money(r.amount_usd)}</Row>}
              </dl>
            </Block>
            <Block title="Transaction">
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800"><ReceiptIcon className="size-3.5" aria-hidden /> {receipt ? `Unlocked ${day(receipt.unlocked_at)}` : "Unlocked"}</span>
                {receipt?.unlock_cents ? <span>${(receipt.unlock_cents / 100).toFixed(2)}</span> : null}
                <span className="inline-flex items-center gap-1 font-semibold text-green-800"><Check className="size-3.5" aria-hidden /> {paid ? "Paid" : plan === "premium" ? "Included in Premium" : "Unlocked"}</span>
                {receipt?.unlock_ref && <span className="text-xs text-slate-500" title={receipt.unlock_ref}>Ref …{receipt.unlock_ref.slice(-10)}</span>}
              </p>
            </Block>
            <Block title="Bookings">
              {bookings.rows === null ? <p className="text-sm text-slate-500">Loading…</p> : mine.length === 0 ? <p className="text-sm text-slate-500">Nothing booked yet. Set the status to Accepted to open the booking calendar.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {mine.map((b) => <li key={b.id} className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span><strong className="text-navy">{b.title}</strong><br /><span className="text-xs text-slate-600">{BOOKING_TYPE_LABEL[b.type]} · {dateLabel(b.starts_at)}, {timeLabel(b.starts_at)} to {timeLabel(b.ends_at)}</span></span></li>)}
                </ul>
              )}
            </Block>
          </div>

          <div className="space-y-4">
            <Block title="Conversation">
              {r.kind === "lead" ? (
                thread === null ? <p className="text-sm text-slate-500">Loading…</p> : thread.length === 0 ? <p className="text-sm text-slate-500">No messages yet. Use Email on the lead to write to the customer; the thread appears here.</p> : (
                  <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {thread.map((m) => (
                      <li key={m.id} className={`rounded-xl p-2.5 text-sm ${m.sender === "business" ? "ml-6 bg-blue-50" : "mr-6 bg-white ring-1 ring-slate-200"}`}>
                        <p className="text-[11px] font-semibold text-slate-500">{m.sender === "business" ? "You" : "Customer"} · {ago(m.created_at)}{m.subject ? ` · ${m.subject}` : ""}</p>
                        <p className="break-words whitespace-pre-line text-slate-800">{m.body}</p>
                      </li>
                    ))}
                  </ol>
                )
              ) : <p className="text-sm text-slate-600">Replies to your emails come to your own inbox. Paste one below and the system reads it for you.</p>}
              <div className="mt-3">
                <label htmlFor={`reply-${r.item_id}`} className="text-xs font-semibold text-slate-600">{r.kind === "lead" ? "A reply that came to your own email?" : "Log a reply you received"}</label>
                <textarea id={`reply-${r.item_id}`} value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={4000} placeholder="Paste their message here. If they ask for a quote or price, the status moves to Interested." className={`${inputClass} mt-1`} />
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={() => void logReply()} disabled={busy || !reply.trim()} className="!rounded-full !px-4 !py-1.5 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Save reply</Button>
                  <span role="status" className="text-xs font-medium text-slate-700">{msg}</span>
                </div>
              </div>
            </Block>
            <Block title="Activity timeline">
              {timeline === null ? <p className="text-sm text-slate-500">Loading…</p> : timeline.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet.</p> : (
                <ol className="max-h-80 space-y-2 overflow-y-auto border-l border-slate-300 pl-3 text-sm">
                  {timeline.map((a, i) => (
                    <li key={i}>
                      <span className="font-semibold text-navy">{ACTIVITY_LABEL[a.type] ?? a.type}</span>
                      <span className="ml-2 text-xs text-slate-500">{ago(a.created_at)}</span>
                      {a.body && <p className={`break-words whitespace-pre-line ${a.body.startsWith("Automatic:") ? "text-violet-800" : "text-slate-700"}`}>{a.body}</p>}
                    </li>
                  ))}
                </ol>
              )}
              {r.note && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><strong>Earlier note:</strong> {r.note}</p>}
            </Block>
          </div>
        </div>
      </div>
    </div>
  );
}
