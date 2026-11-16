import { useCallback, useEffect, useState } from "react";
import { callApi } from "./api";

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  isDefault: boolean;
}

export const brandName = (b: string) => (b === "amex" ? "American Express" : b === "unionpay" ? "UnionPay" : b.charAt(0).toUpperCase() + b.slice(1));

/** The signed-in business's saved cards (brand, last four digits and expiry only), from Stripe. `cards` is null until loaded or when payments are off. */
export function useSavedCards(enabled = true) {
  const [state, setState] = useState<{ cards: SavedCard[] | null; unavailable: boolean; failed: boolean }>({ cards: null, unavailable: false, failed: false });
  const reload = useCallback(async () => {
    const res = await callApi<{ cards?: SavedCard[] }>("/api/stripe/cards", { action: "list" });
    setState({ cards: res.status === 200 ? res.data.cards ?? [] : null, unavailable: res.status === 501, failed: res.status !== 200 && res.status !== 501 });
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [enabled, reload]);
  const defaultCard = state.cards?.find((c) => c.isDefault) ?? null;
  return { ...state, defaultCard, reload, setCards: (cards: SavedCard[]) => setState((s) => ({ ...s, cards })) };
}
