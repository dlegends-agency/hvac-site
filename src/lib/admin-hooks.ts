import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Fetches data and, when intervalMs is set, silently refreshes it on a timer (skipped while the tab is hidden).
 * loading is only true until the first response, so refreshes never flash a spinner. Change key to refetch.
 */
export function useLiveQuery<T>(
  initial: T,
  run: () => PromiseLike<{ data: unknown; error: unknown }>,
  opts: { key: string; intervalMs: number | null },
) {
  const [state, setState] = useState<{ data: T; loading: boolean; error: boolean; updatedAt: Date | null }>({
    data: initial,
    loading: true,
    error: false,
    updatedAt: null,
  });
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const load = useCallback(async () => {
    const { data, error } = await runRef.current();
    setState((s) => ({
      data: error ? s.data : (data as T),
      loading: false,
      error: Boolean(error),
      updatedAt: error ? s.updatedAt : new Date(),
    }));
  }, []);

  const { key, intervalMs } = opts;
  useEffect(() => {
    void load();
    if (!intervalMs) return;
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, intervalMs);
    return () => clearInterval(id);
  }, [load, key, intervalMs]);

  return { ...state, reload: load };
}

/** Current time in ms, re-rendering every intervalMs (for "updated 12s ago" labels). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Animates a number up to its target (respects reduced motion). */
export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = target;
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(from + (target - from) * eased);
      fromRef.current = next;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}
