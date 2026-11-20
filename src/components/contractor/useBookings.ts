import { useCallback, useEffect, useState } from "react";
import type { Booking } from "@/lib/bookings";
import { getSupabaseBrowser } from "@/lib/supabase";

/** All of the business's bookings (row security limits it to its own), with add, change and remove. */
export function useBookings(enabled: boolean) {
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error: e } = await getSupabaseBrowser().from("bookings").select("*").order("starts_at", { ascending: true }).limit(1000);
    setError(e ? (e.code === "42P01" || e.code === "PGRST205" ? "Bookings are not set up yet. Run supabase/schema-bookings.sql." : e.message) : null);
    setRows((data as Booking[] | null) ?? []);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [enabled, reload]);
  return { rows, error, reload };
}
