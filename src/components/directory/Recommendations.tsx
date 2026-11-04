import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useCaptcha } from "@/components/ui/Turnstile";
import type { Recommendation } from "@/lib/recommendations";
import type { Listing } from "@/lib/types";

const BODY_MIN = 20;
const BODY_MAX = 1000;
const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });

function RecommendForm({ listing }: { listing: Listing }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [length, setLength] = useState(0);
  const captcha = useCaptcha();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget; // React clears currentTarget after the first await
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/recommend/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: listing.slug, name: f.get("name"), email: f.get("email"), body: f.get("body"), used: f.get("used") === "on", website: f.get("website"), captcha: captcha.token,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && j.ok) {
        setMsg({ ok: true, text: j.message ?? "Check your email to confirm." });
        form.reset();
        setLength(0);
      } else {
        setMsg({ ok: false, text: j.error ?? "Could not send your recommendation. Please try again." });
      }
    } catch {
      setMsg({ ok: false, text: "Could not send your recommendation. Please check your connection and try again." });
    }
    captcha.reset();
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rec-name" label="Your name" hint="Shown as first name and last initial, for example Maria L.">
          {(a) => <input id="rec-name" name="name" required minLength={2} maxLength={60} autoComplete="name" className={inputClass} {...a} />}
        </Field>
        <Field id="rec-email" label="Your email" hint="We email you a link to confirm. It is never shown.">
          {(a) => <input id="rec-email" name="email" type="email" required maxLength={200} autoComplete="email" className={inputClass} {...a} />}
        </Field>
      </div>
      <Field id="rec-body" label="Your recommendation" hint={`${length}/${BODY_MAX} characters. Leave out links and email addresses.`}>
        {(a) => <textarea id="rec-body" name="body" required rows={5} minLength={BODY_MIN} maxLength={BODY_MAX} onChange={(e) => setLength(e.target.value.length)} className={inputClass} {...a} />}
      </Field>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
        <input type="checkbox" name="used" required className="mt-0.5 size-4 accent-primary" /> I have used {listing.business_name}, and I was not paid or asked to write this.
      </label>
      {/* Hidden trap field: people never see it, simple bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {captcha.widget}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy || captcha.blocked} className="!rounded-full px-6">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Send recommendation</Button>
        <p role="status" className={`text-sm font-medium ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</p>
      </div>
    </form>
  );
}

/**
 * Customer recommendations. The business decides which ones to show (and can feature one above "About us"), so this says so.
 * `items` is undefined while loading and null when the feature is not available yet.
 */
export function Recommendations({ listing, items }: { listing: Listing; items: Recommendation[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  if (items === undefined || items === null) return null;

  return (
    <section id="recommendations" className="mt-8 scroll-mt-6" aria-labelledby="rec-heading">
      <h2 id="rec-heading" className="flex items-center gap-2 text-lg font-semibold text-navy">
        <ThumbsUp className="size-5 text-primary" aria-hidden /> Recommendations{items.length > 0 ? ` (${items.length})` : ""}
      </h2>

      {params.get("recommendation") === "confirmed" && (
        <p role="status" className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Thank you. Your email is confirmed. The business decides whether to show your recommendation, so it may not appear straight away.
        </p>
      )}

      {items.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-slate-200 p-4">
              <p className="whitespace-pre-line text-slate-800">{r.body}</p>
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold text-navy">{r.author_name}</span> · {month(r.created_at)}
                {r.email_confirmed && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Email confirmed</span>}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-600">No recommendations shown yet. Have you used this business?</p>
      )}

      {open ? <RecommendForm listing={listing} /> : (
        <Button variant="secondary" onClick={() => setOpen(true)} className="mt-4 !rounded-full !px-5 !py-2 text-sm"><ThumbsUp className="size-4" aria-hidden /> Recommend this business</Button>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Recommendations are written by customers. The business reads each one and chooses which to show, and cannot edit them. &quot;Email confirmed&quot; means the
        writer opened a link we emailed them. HVACHelp does not check that the work was done.
      </p>
    </section>
  );
}
