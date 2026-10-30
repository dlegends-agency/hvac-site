import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// True when this page load is a browser refresh. Decided once at startup.
const wasReload =
  typeof window !== "undefined" &&
  (window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload";
let initialKey: string | null = null;

/** Scrolls to #hash targets after navigation, or to the top for plain route changes. */
export function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // On a refresh, stay at the top instead of jumping to a leftover #section. In-app navigation still scrolls normally.
    const key = pathname + hash;
    initialKey ??= key;
    if (wasReload && key === initialKey) {
      if (hash) window.history.replaceState(null, "", pathname);
      window.scrollTo(0, 0);
      return;
    }
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // Wait a frame so the target page has rendered.
    const id = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(id);
  }, [pathname, hash]);

  return null;
}
