import { useState } from "react";
import { CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { callApi, paymentsNotReady } from "./api";
import { brandName, useSavedCards, type SavedCard } from "./useSavedCards";

const expired = (c: SavedCard) => new Date(c.exp_year, c.exp_month, 1).getTime() < Date.now();

/**
 * The business's saved cards: add a card (typed in on Stripe's own page, so the number never touches this site), choose the default
 * card (used for plan renewals and for one-click unlocking) and remove a card. Only the brand, last four digits and expiry are shown.
 */
export function SavedCards() {
  const { cards, unavailable, failed, setCards, reload } = useSavedCards();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    params.get("card") === "added" ? { ok: true, text: "Card saved. If it is your only card it is now your default." } : null,
  );

  async function add() {
    setBusy("add");
    setMsg(null);
    const res = await callApi<{ url?: string; missing?: string[] }>("/api/stripe/cards", { action: "add" });
    if (res.data.url) return void window.location.assign(res.data.url);
    setBusy(null);
    setMsg({ ok: false, text: res.status === 501 ? paymentsNotReady(res, "Online payments aren't switched on yet. Please contact us.") : "We couldn't open the card page. Please try again." });
  }

  async function change(action: "default" | "remove", card: SavedCard) {
    if (action === "remove" && !window.confirm(`Remove the ${brandName(card.brand)} card ending in ${card.last4}?`)) return;
    setBusy(`${action}-${card.id}`);
    setMsg(null);
    const res = await callApi<{ cards?: SavedCard[]; error?: string }>("/api/stripe/cards", { action, paymentMethodId: card.id });
    setBusy(null);
    if (res.status === 200 && res.data.cards) {
      setCards(res.data.cards);
      return setMsg({ ok: true, text: action === "default" ? `${brandName(card.brand)} ending in ${card.last4} is now your default card.` : "Card removed." });
    }
    setMsg({ ok: false, text: res.status === 409 && res.data.error ? res.data.error : "We couldn't do that. Please try again." });
    void reload();
  }

  return (
    <Panel title="Payment methods">
      {unavailable ? (
        <p className="text-sm text-slate-700">Online payments aren&apos;t switched on yet, so cards can&apos;t be saved.</p>
      ) : failed ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">Your cards couldn&apos;t be loaded right now. Please try again later.</p>
      ) : cards === null ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : (
        <>
          {cards.length === 0 ? (
            <p className="text-sm text-slate-700">No card saved yet. Add one to unlock customer requests, permits and bids in one click, and to pay for your plan.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {cards.map((c) => (
                <li key={c.id} className={`rounded-xl border p-4 ${c.isDefault ? "border-primary bg-blue-50/40" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-3 text-sm text-slate-800">
                      <CreditCard className="size-7 text-slate-500" aria-hidden />
                      <span>
                        <strong>{brandName(c.brand)}</strong> •••• <strong>{c.last4}</strong>
                        <span className={`block text-xs ${expired(c) ? "font-semibold text-red-700" : "text-slate-500"}`}>{expired(c) ? "Expired " : "Expires "}{String(c.exp_month).padStart(2, "0")}/{c.exp_year}</span>
                      </span>
                    </p>
                    {c.isDefault && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">Default</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!c.isDefault && (
                      <Button variant="secondary" onClick={() => change("default", c)} disabled={busy !== null} className="!rounded-full !px-3.5 !py-1.5 text-sm">
                        {busy === `default-${c.id}` && <Loader2 className="size-4 animate-spin" aria-hidden />} Make default
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => change("remove", c)} disabled={busy !== null} className="!rounded-full !px-3.5 !py-1.5 text-sm !text-red-700">
                      {busy === `remove-${c.id}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button onClick={add} disabled={busy !== null} className="mt-4 !rounded-full !px-5 !py-2 text-sm">
            {busy === "add" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Add a card
          </Button>
        </>
      )}
      <div role="status">{msg && <p className={`mt-3 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}</div>
      <p className="mt-4 text-xs text-slate-500">
        The default card is used to renew your plan and for one-click unlocking. You enter your card on Stripe&apos;s secure page: we never see or store your card number, only the brand, last four digits and expiry.
      </p>
    </Panel>
  );
}
