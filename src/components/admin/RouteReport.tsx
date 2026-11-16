import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Row {
  listing_id: string;
  business_name: string;
  city: string;
  state: string;
  postal_code: string | null;
  listing_status: string;
  has_login: boolean;
  miles: number | null;
  radius: number;
  matched: boolean;
  reason: string;
}

/** Admin: every business with the reason it did or did not match this request (the same rules that send requests automatically). */
export function RouteReport({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function check() {
    setBusy(true);
    setError(false);
    const { data, error: err } = await getSupabaseBrowser().rpc("admin_route_report", { p_lead: leadId });
    setBusy(false);
    if (err) return setError(true);
    setRows((data as Row[] | null) ?? []);
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <Button variant="secondary" onClick={check} disabled={busy} className="w-full !py-2 text-sm">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {rows ? "Check matching again" : "Why did / didn't contractors match?"}
      </Button>
      <div role="status">{error && <p className="mt-2 text-sm font-medium text-red-700">Could not check. Run the latest <code>supabase/schema-contractors.sql</code> in the Supabase SQL Editor.</p>}</div>
      {rows && (
        rows.length === 0 ? <p className="mt-3 text-sm text-slate-600">There are no businesses in the directory yet.</p> : (
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li key={r.listing_id} className="flex items-start gap-2 text-sm">
                {r.matched ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Matches" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-label="Does not match" />}
                <span className="min-w-0">
                  <Link to={`/admin/listings/${r.listing_id}`} className="font-semibold text-navy hover:text-primary hover:underline">{r.business_name}</Link>
                  <span className="block text-xs text-slate-500">{[r.city, r.state, r.postal_code].filter(Boolean).join(", ")}{r.miles !== null ? ` · ${r.miles} miles away` : ""}</span>
                  <span className={`block text-xs ${r.matched ? "text-green-800" : "text-slate-700"}`}>{r.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
