import { useEffect, useState, type ReactNode } from "react";
import { Lock, X } from "lucide-react";
import { UnlockButtons } from "@/components/contractor/UnlockButtons";
import { TIERS, type Tier } from "@/lib/permit-score";

export const TIER_STYLE: Record<Tier, { bar: string; score: string; head: string }> = {
  hot: { bar: "border-l-red-500", score: "text-red-600", head: "text-red-600" },
  warm: { bar: "border-l-amber-400", score: "text-amber-500", head: "text-amber-500" },
  cold: { bar: "border-l-sky-400", score: "text-sky-500", head: "text-sky-500" },
};

export const dayText = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date";

/** Hot, Warm and Cold as three columns of cards (stacked on small screens). */
export function TierColumns<T extends { tier: Tier }>({ rows, itemKey, card, perColumn = 80 }: { rows: T[]; itemKey: (row: T) => string; card: (row: T) => ReactNode; perColumn?: number }) {
  return (
    <div className="grid w-full items-start gap-5 md:grid-cols-2 2xl:grid-cols-[1.2fr_1.2fr_0.8fr]">
      {(["hot", "warm", "cold"] as Tier[]).map((tier) => {
        const list = rows.filter((r) => r.tier === tier);
        return (
          <section key={tier} aria-label={TIERS[tier].label} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className={`text-2xl font-extrabold tracking-tight uppercase ${TIER_STYLE[tier].head}`}>{TIERS[tier].label} <span className="text-base font-semibold text-slate-500">({list.length})</span></h2>
              <span className="text-xs text-slate-500">{TIERS[tier].hint}</span>
            </div>
            {list.length === 0 ? <p className="text-sm text-slate-500">None right now.</p> : (
              <ul className="grid max-h-[75vh] gap-2.5 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-1">
                {list.slice(0, perColumn).map((r) => <li key={itemKey(r)} className="contents">{card(r)}</li>)}
                {list.length > perColumn && <li className="text-center text-xs text-slate-500 lg:col-span-2 2xl:col-span-1">Showing the top {perColumn} of {list.length}. Use the filters to narrow it down.</li>}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The score broken into its parts, as bars. */
export function ScoreBars({ parts }: { parts: { label: string; points: number; max: number; reason: string }[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {parts.map((x) => (
        <li key={x.label} className="text-sm">
          <div className="flex justify-between text-slate-700"><span className="font-medium">{x.label}</span><span>{x.points} / {x.max}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${(x.points / x.max) * 100}%` }} /></div>
          <p className="mt-0.5 text-xs text-slate-500 first-letter:uppercase">{x.reason}</p>
        </li>
      ))}
    </ul>
  );
}

/** A panel that slides over the page from the right. Escape or a click outside closes it. */
export function SidePanel({ label, tier, score, title, subtitle, onClose, children }: { label: string; tier: Tier; score: number; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const style = TIER_STYLE[tier];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-xs font-bold tracking-wide uppercase ${style.score}`}>{TIERS[tier].label} · {TIERS[tier].hint}</p>
            <h2 className="mt-1 text-xl font-extrabold text-navy">{title}</h2>
            {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
          </div>
          <div className="flex items-start gap-3">
            <p className={`text-4xl leading-none font-extrabold ${style.score}`} aria-label={`Score ${score} out of 100`}>{score}</p>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" aria-hidden /></button>
          </div>
        </div>
        {children}
      </aside>
    </div>
  );
}

export const Fact = ({ label, value }: { label: string; value: string | null | undefined }) =>
  value ? <div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="text-sm text-slate-800">{value}</dd></div> : null;

export const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-normal";
export const searchClass = "w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 sm:w-80";

/** Business owners: the business emailing from a permit or bid. When given, an unlocked contact's email opens the email window instead of the mail program. */
export interface ComposeInfo {
  businessName: string;
}

/** How a business owner pays to see the phone and email on a lead. Admins never see this. */
export interface UnlockInfo {
  /** US dollars: $5 on the paid plan, $10 otherwise (the server decides what is really charged). */
  price: number;
}

/** The "pay to unlock" box. Phone numbers and emails stay hidden (they are not even sent to the browser) until the payment is done. */
export function UnlockBox({ kind, itemId, price, what }: { kind: "permit" | "bid"; itemId: string; price: number; what: string }) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy"><Lock className="size-4 text-slate-500" aria-hidden /> Phone and email are locked</p>
      <p className="mt-1 text-sm text-slate-600">You can see everything else about this {what}. Unlock it to see {kind === "permit" ? "the contractor's phone number, email and website, and the city record" : "the contracting officer's phone number and email, and the full notice details"}.</p>
      <div className="mt-3">
        <UnlockButtons endpoint="/api/stripe/unlock-opportunity" body={{ kind, itemId }} price={price} returnTo={`/contractor/leads?unlocked=1&open=${kind}:${itemId}`} />
        <p className="mt-2 text-xs text-slate-500">One payment for this {what}. Not refundable.</p>
      </div>
    </div>
  );
}

/** A small lock icon with a label, for a card or a contact row. */
export const LockedTag = ({ text = "Locked" }: { text?: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"><Lock className="size-3" aria-hidden /> {text}</span>
);

/** A titled block in a detail panel, so a long record reads as a few clear parts. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-navy">{title}</h3>{aside && <span className="text-xs text-slate-500">{aside}</span>}</div>
      {children}
    </section>
  );
}

/** A small number-and-label tile for the facts that matter first (when it is due, how big it is). */
export function Glance({ label, value, hint, tone = "" }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone || "border-slate-200 bg-slate-50"}`}>
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-bold text-navy">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Long text, cut to a few lines with a button to read all of it. Paragraph breaks are kept. */
export function Expandable({ text, lines = 6 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420 || text.split("\n").length > lines;
  return (
    <div>
      <p className={`text-sm leading-relaxed whitespace-pre-line text-slate-700 ${open || !long ? "" : "line-clamp-6"}`}>{text}</p>
      {long && <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-sm font-semibold text-primary hover:underline">{open ? "Show less" : "Read all"}</button>}
    </div>
  );
}

/** The score and its parts, folded away until asked for. */
export function ScoreDetails({ parts }: { parts: { label: string; points: number; max: number; reason: string }[] }) {
  return (
    <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-navy">Why this score</summary>
      <ScoreBars parts={parts} />
    </details>
  );
}
