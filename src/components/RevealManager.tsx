import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Reveals [data-reveal] elements as they enter the viewport. Does nothing when the visitor prefers reduced motion. */
export function RevealManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.add("reveal-ready");

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    const scan = () => {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        if (!seen.has(el) && !el.classList.contains("is-visible")) {
          seen.add(el);
          io.observe(el);
        }
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    const app = document.getElementById("root");
    if (app) mo.observe(app, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
