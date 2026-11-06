import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, History, Loader2, MapPin, MessageSquare, Phone } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { requestLogLabel } from "@/lib/messages";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

interface Business {
  listing_id: string;
  messages: boolean;
  name: string;
  slug: string;
  city: string;
  state: string;
  phone: string | null;
  status: "new" | "contacted" | "won" | "lost";
  sent_at: string;
  contacted_at: string | null;
}

interface Request {
  id: string;
  created_at: string;
  issue: string;
  urgency: string;
  city: string;
  state: string;
  postal_code: string;
  street: string;
  description: string | null;
  status: "new" | "contacted" | "closed";
  businesses: Business[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** What a business's own status means to the customer. */
const businessStatus: Record<Business["status"], { label: string; tone: string }> = {
  new: { label: "Received. Not marked as contacted yet", tone: "bg-slate-100 text-slate-700" },
  contacted: { label: "Has been in touch", tone: "bg-green-100 text-green-800" },
  won: { label: "Marked as booked", tone: "bg-green-100 text-green-800" },
  lost: { label: "Marked as closed", tone: "bg-slate-100 text-slate-600" },
};

/** Where a request stands: received, sent to businesses, a business has been in touch, closed. */
function Progress({ request: r }: { request: Request }) {
  const sent = r.businesses.length > 0;
  const firstSent = sent ? r.businesses.map((b) => b.sent_at).sort()[0] : null;
  const inTouch = r.businesses.filter((b) => b.status !== "new");
  const firstTouch = inTouch.map((b) => b.contacted_at).filter((t): t is string => Boolean(t)).sort()[0] ?? null;
  const closed = r.status === "closed";
  const steps: { label: string; done: boolean; when: string | null }[] = [
    { label: "Request received", done: true, when: r.created_at },
    { label: sent ? `Sent to ${r.businesses.length} ${r.businesses.length === 1 ? "business" : "businesses"}` : "Finding businesses near you", done: sent, when: firstSent },
    { label: inTouch.length > 0 ? "A business has been in touch" : "Waiting to hear from a business", done: inTouch.length > 0, when: firstTouch },
    ...(closed ? [{ label: "Request closed", done: true, when: null }] : []),
  ];
  return (
    <ol className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Progress of this request">
      {steps.map((s) => (
        <li key={s.label} className={`rounded-xl border p-3 text-sm ${s.done ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
          <span className={`flex items-center gap-1.5 font-semibold ${s.done ? "text-green-900" : "text-slate-600"}`}>
            {s.done ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <Clock className="size-4 shrink-0" aria-hidden />} {s.label}
          </span>
          {s.when && <span className="mt-0.5 block text-xs text-slate-500">{day(s.when)}</span>}
        </li>
      ))}
    </ol>
  );
}

interface LogRow {
  created_at: string;
  kind: string;
  business_name: string | null;
}

/** The steps one request went through, loaded when opened. */
function RequestLog({ requestId }: { requestId: string }) {
  const [state, setState] = useState<"closed" | "loading" | "error" | LogRow[]>("closed");

  async function toggle() {
    if (state !== "closed") return setState("closed");
    setState("loading");
    const { data, error } = await getSupabaseBrowser().rpc("my_request_log", { p_lead: requestId });
    setState(error ? "error" : ((data as LogRow[] | null) ?? []));
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button type="button" onClick={toggle} aria-expanded={state !== "closed"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        {state === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <History className="size-4" aria-hidden />} {state === "closed" ? "Activity log" : "Hide activity log"}
      </button>
      {state === "error" && <p className="mt-2 text-sm text-slate-500">The activity log isn&apos;t available yet.</p>}
      {Array.isArray(state) && (state.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p> : (
        <ol className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 text-sm">
          {state.map((e, i) => (
            <li key={`${e.kind}-${i}`}>
              <span className="font-medium text-navy">{requestLogLabel(e.kind, e.business_name)}</span>
              <span className="ml-2 text-xs text-slate-500">{new Date(e.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </li>
          ))}
        </ol>
      ))}
    </div>
  );
}

/** The signed-in customer's own requests, where each one stands, its activity log, and a way to message the businesses. */
export default function AccountPage() {
  const [state, setState] = useState<{ requests: Request[] } | "loading" | "unavailable">("loading");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- accounts need Supabase
      setState("unavailable");
      return;
    }
    void (async () => {
      const { data: rows, error } = await getSupabaseBrowser().rpc("my_requests");
      setState(error ? "unavailable" : { requests: (rows as Request[] | null) ?? [] });
    })();
  }, []);

  return (
    <>
      {state === "loading" && <p className="flex items-center gap-2 text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>}
      {state === "unavailable" && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">Your requests can&apos;t be shown right now. Please try again later.</p>}

      {typeof state === "object" && state.requests.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">
          <p>No requests yet. Requests you send while signed in, or with this email address after you confirm it, show up here.</p>
          <Link to="/#request" className={buttonClass("primary", "mt-4 !rounded-full")}>Ask for HVAC help</Link>
        </div>
      )}

      {typeof state === "object" && state.requests.length > 0 && (
        <ul className="grid gap-5 lg:grid-cols-2">
          {state.requests.map((r) => (
            <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold text-navy">{r.issue}</h2>
                <span className="text-sm text-slate-500">Sent {day(r.created_at)}</span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="size-4 shrink-0" aria-hidden /> {r.street}, {r.city}, {r.state} {r.postal_code} · {r.urgency}</p>
              {r.description && <p className="mt-2 line-clamp-3 text-sm text-slate-700">{r.description}</p>}

              <Progress request={r} />

              <h3 className="mt-4 text-sm font-semibold text-navy">Businesses that received your request</h3>
              {r.businesses.length === 0 ? (
                <p className="mt-1 flex items-start gap-2 text-sm text-slate-600"><Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> We have not found a contractor near you yet. We will keep looking.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {r.businesses.map((b) => (
                    <li key={b.slug} className="rounded-xl border border-slate-100 p-3">
                      <Link to={`/directory/${b.slug}`} className="font-medium text-navy hover:text-primary">{b.name}</Link>
                      <p className="text-sm text-slate-500">{b.city}, {b.state}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${businessStatus[b.status].tone}`}>
                          {b.status !== "new" && <CheckCircle2 className="size-3.5" aria-hidden />} {businessStatus[b.status].label}
                        </span>
                        {b.contacted_at && <span className="text-xs text-slate-500">{day(b.contacted_at)}</span>}
                        {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Phone className="size-3.5" aria-hidden /> {b.phone}</a>}
                        {b.messages && <Link to={`/account/messages?lead=${r.id}&listing=${b.listing_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><MessageSquare className="size-3.5" aria-hidden /> Message</Link>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">&quot;Has been in touch&quot; is set by the business itself. If nobody has contacted you, call one of the businesses above.</p>

              <RequestLog requestId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
