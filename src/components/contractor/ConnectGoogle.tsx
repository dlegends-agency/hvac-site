import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Listing } from "@/lib/types";
import { callApi } from "./api";

interface Candidate {
  id: string;
  name: string;
  address: string;
}

/** Lets the contractor pick their business from Google's search results. We store only Google's place ID. */
export function ConnectGoogle({ listing, reload }: { listing: Listing; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(listing.google_place_id);

  const fail = (status: number) =>
    setError(status === 501 ? "Google ratings aren't switched on yet. Please contact us." : "That didn't work. Please try again.");

  async function find() {
    setBusy("find");
    setError(null);
    const res = await callApi<{ candidates?: Candidate[] }>("/api/google/find", {});
    setBusy(null);
    if (res.status !== 200) return fail(res.status);
    setCandidates(res.data.candidates ?? []);
  }

  async function link(placeId: string | null) {
    setBusy(placeId ?? "unlink");
    setError(null);
    const res = await callApi("/api/google/link", { placeId });
    setBusy(null);
    if (res.status !== 200) return fail(res.status);
    setCandidates(null);
    await reload();
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <CheckCircle2 className="size-5 text-green-600" aria-hidden /> Connected to your Google listing. Your star rating and review count show on your listing page.
          </p>
          <Button variant="secondary" onClick={() => link(null)} disabled={busy !== null} className="!rounded-full !px-4 !py-1.5 text-sm">
            {busy === "unlink" && <Loader2 className="size-4 animate-spin" aria-hidden />} Disconnect
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-700">Connect your Google listing so your real star rating and review count appear automatically. You don&apos;t type anything in.</p>
          <Button onClick={find} disabled={busy !== null} className="mt-3 !rounded-full !px-5 !py-2 text-sm">
            {busy === "find" && <Loader2 className="size-4 animate-spin" aria-hidden />} Find my business on Google
          </Button>
        </>
      )}

      {candidates && (
        <div className="mt-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-600">We couldn&apos;t find a match for your business name and city. You can still add your Google reviews link below.</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-navy">Which one is your business?</p>
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span><span className="block font-semibold text-navy">{c.name}</span><span className="text-sm text-slate-600">{c.address}</span></span>
                    <Button variant="secondary" onClick={() => link(c.id)} disabled={busy !== null} className="!rounded-full !px-4 !py-1.5 text-sm">
                      {busy === c.id && <Loader2 className="size-4 animate-spin" aria-hidden />} This is us
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div role="alert">{error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}</div>
    </div>
  );
}
