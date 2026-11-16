import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { callApi, paymentsNotReady } from "./api";
import { brandName, useSavedCards } from "./useSavedCards";

/**
 * The pay buttons for unlocking one lead. With a default card saved it offers one click ("Pay $5 with Visa •••• 4242"); otherwise, or when
 * the saved card is declined, it opens Stripe's checkout page. `body` says what is being unlocked, `returnTo` is where to go once it is paid.
 */
export function UnlockButtons({ endpoint, body, price, returnTo }: { endpoint: string; body: Record<string, unknown>; price: number; returnTo: string }) {
  const { defaultCard, cards } = useSavedCards();
  const [busy, setBusy] = useState<"card" | "checkout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy("checkout");
    setError(null);
    const res = await callApi<{ url?: string; missing?: string[]; detail?: string }>(endpoint, body);
    if (res.data.url) return void window.location.assign(res.data.url);
    setBusy(null);
    setError(
      res.status === 501 ? paymentsNotReady(res, "Online payments aren't switched on yet. Please contact us.")
        : res.status === 409 ? "Already unlocked. Refresh the page."
          : `We couldn't start the payment. Please try again.${res.data.detail ? ` (${res.data.detail})` : ""}`,
    );
  }

  async function payWithCard() {
    setBusy("card");
    setError(null);
    const res = await callApi<{ unlocked?: boolean; error?: string }>(endpoint, { ...body, useSavedCard: true });
    if (res.data.unlocked) return void window.location.assign(returnTo);
    setBusy(null);
    setError(
      res.status === 402 ? "Your saved card was declined or needs confirming. Try again with another card."
        : res.status === 409 ? "Already unlocked. Refresh the page."
          : "We couldn't charge your saved card. Please try again, or use another card.",
    );
  }

  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden />;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {defaultCard ? (
          <>
            <button type="button" onClick={payWithCard} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
              {busy === "card" && spinner} Pay ${price} with {brandName(defaultCard.brand)} •••• {defaultCard.last4}
            </button>
            <button type="button" onClick={checkout} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50 disabled:opacity-60">
              {busy === "checkout" && spinner} Use another card
            </button>
          </>
        ) : (
          <button type="button" onClick={checkout} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
            {busy === "checkout" && spinner} Unlock for ${price}
          </button>
        )}
      </div>
      {cards && cards.length > 0 && !defaultCard && <p className="mt-2 text-xs text-slate-500">Choose a default card in <Link to="/contractor/account" className="font-semibold text-primary underline">Account settings</Link> for one-click payments.</p>}
      <div role="alert">{error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}</div>
    </div>
  );
}
