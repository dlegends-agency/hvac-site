import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Lead, PageView } from "@/lib/types";

interface Query<T> {
  data: T;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

function useSupabaseQuery<T>(initial: T, run: () => PromiseLike<{ data: unknown; error: unknown }>): Query<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch lifecycle
    setLoading(true);
    run().then(({ data, error }) => {
      if (cancelled) return;
      setError(Boolean(error));
      if (!error) setData(data as T);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { data, loading, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export const useLeads = () =>
  useSupabaseQuery<Lead[]>([], () =>
    getSupabaseBrowser().from("leads").select("*").order("created_at", { ascending: false }).limit(2000),
  );

export const usePageViews = (days: number) =>
  useSupabaseQuery<PageView[]>([], () =>
    getSupabaseBrowser()
      .from("page_views")
      .select("created_at,path,referrer_host,utm_source,device,session_id")
      .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20000),
  );

/** Counts items by a key, sorted descending. */
export function countBy<T>(items: T[], key: (i: T) => string | null | undefined, limit = 8) {
  const map = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** Daily counts for the last `days` days (local time), oldest first. */
export function dailyCounts(dates: string[], days: number) {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA"), 0);
  }
  for (const d of dates) {
    const k = new Date(d).toLocaleDateString("en-CA");
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}
