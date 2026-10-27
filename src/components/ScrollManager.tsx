import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Scrolls to #hash targets after navigation, or to the top for plain route changes. */
export function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
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
