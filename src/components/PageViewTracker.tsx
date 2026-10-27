import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

let lastTracked = "";

function sessionId(): string {
  try {
    let id = localStorage.getItem("hvac_sid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hvac_sid", id);
    }
    return id;
  } catch {
    return "";
  }
}

/**
 * Privacy-light page view counter. Stores only the path, referrer host, UTM source, device class and a random
 * per-browser id. No IP, no user agent, no cookies. Skips /admin and browsers sending Do Not Track.
 */
export function PageViewTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isSupabaseConfigured || pathname.startsWith("/admin") || location.search.includes("seo_audit=1") || navigator.doNotTrack === "1") return;
    if (lastTracked === pathname) return;
    lastTracked = pathname;

    let referrerHost: string | null = null;
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      referrerHost = host && host !== location.hostname ? host : null;
    } catch {
      // Malformed referrer: treat as direct traffic.
    }

    const w = window.innerWidth;
    void getSupabaseBrowser()
      .from("page_views")
      .insert({
        path: pathname.slice(0, 300),
        referrer_host: referrerHost,
        utm_source: new URLSearchParams(location.search).get("utm_source")?.slice(0, 100) ?? null,
        device: w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop",
        session_id: sessionId() || null,
      })
      .then(() => {});
  }, [pathname]);

  return null;
}
