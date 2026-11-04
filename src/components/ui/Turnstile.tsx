import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Cloudflare Turnstile, the CAPTCHA used on every sign-up, sign-in and public form. It is switched on by setting VITE_TURNSTILE_SITE_KEY
// (the public site key); without it no widget is shown and forms work as before.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const captchaEnabled = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

let script: Promise<TurnstileApi | null> | null = null;
function loadTurnstile(): Promise<TurnstileApi | null> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  script ??= new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = () => resolve(w.turnstile ?? null);
    el.onerror = () => {
      script = null;
      resolve(null);
    };
    document.head.appendChild(el);
  });
  return script;
}

function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    let widget: string | null = null;
    let cancelled = false;
    void loadTurnstile().then((api) => {
      if (cancelled || !api || !box.current || !SITE_KEY) return;
      widget = api.render(box.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => callback.current(t),
        "expired-callback": () => callback.current(null),
        "error-callback": () => callback.current(null),
      });
    });
    return () => {
      cancelled = true;
      if (widget) (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(widget);
    };
  }, []);

  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}

/**
 * CAPTCHA state for one form. Show `widget` above the submit button, send `token` with the request, disable the button while
 * `blocked`, and call `reset()` after every attempt (a token works once).
 */
export function useCaptcha(): { token: string | null; widget: ReactNode; blocked: boolean; reset: () => void } {
  const [token, setToken] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setN((x) => x + 1);
  }, []);
  return {
    token,
    widget: captchaEnabled ? <Turnstile key={n} onToken={setToken} /> : null,
    blocked: captchaEnabled && !token,
    reset,
  };
}
