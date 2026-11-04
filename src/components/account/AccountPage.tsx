import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, LogOut, MapPin, Phone } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Button, buttonClass } from "@/components/ui/Button";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { usePageMeta } from "@/lib/use-page-meta";

interface Business {
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

/** The signed-in customer's own requests and where each one stands. */
export default function AccountPage() {
  usePageMeta({ title: "My requests | HVACHelp", noindex: true });
  const navigate = useNavigate();
  const [state, setState] = useState<{ email: string; requests: Request[] } | "loading" | "unavailable">("loading");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- accounts need Supabase
      setState("unavailable");
      return;
    }
    const supabase = getSupabaseBrowser();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return navigate("/account/login", { replace: true });
      const { data: rows, error } = await supabase.rpc("my_requests");
      setState(error ? "unavailable" : { email: user.email ?? "", requests: (rows as Request[] | null) ?? [] });
    })();
  }, [navigate]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    navigate("/account/login", { replace: true });
  }

  return (
    <>
      <Header />
      <main className="bg-surface py-12">
        <div className="mx-auto max-w-site px-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-navy">My requests</h1>
              {typeof state === "object" && <p className="mt-1 text-sm text-slate-600">Signed in as {state.email}</p>}
            </div>
            <div className="flex gap-3">
              <Link to="/#request" className={buttonClass("primary", "!rounded-full !py-2 text-sm")}>New request</Link>
              {typeof state === "object" && <Button variant="secondary" onClick={signOut} className="!rounded-full !py-2 text-sm"><LogOut className="size-4" aria-hidden /> Sign out</Button>}
            </div>
          </div>

          {state === "loading" && <p className="mt-8 flex items-center gap-2 text-slate-600"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>}
          {state === "unavailable" && <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">Your requests can&apos;t be shown right now. Please try again later.</p>}

          {typeof state === "object" && state.requests.length === 0 && (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">
              <p>No requests yet. Requests you send while signed in, or with this email address after you confirm it, show up here.</p>
              <Link to="/#request" className={buttonClass("primary", "mt-4 !rounded-full")}>Ask for HVAC help</Link>
            </div>
          )}

          {typeof state === "object" && state.requests.length > 0 && (
            <ul className="mt-8 grid gap-5 lg:grid-cols-2">
              {state.requests.map((r) => (
                <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="font-semibold text-navy">{r.issue}</h2>
                    <span className="text-sm text-slate-500">Sent {day(r.created_at)}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="size-4 shrink-0" aria-hidden /> {r.street}, {r.city}, {r.state} {r.postal_code} · {r.urgency}</p>
                  {r.description && <p className="mt-2 line-clamp-3 text-sm text-slate-700">{r.description}</p>}

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
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-slate-500">&quot;Has been in touch&quot; is set by the business itself. If nobody has contacted you, call one of the businesses above.</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
