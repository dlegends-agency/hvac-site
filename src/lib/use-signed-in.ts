import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Whether someone is signed in (any account: customer, contractor or admin). False on the server and until the browser has checked,
 * so prerendered pages always start as signed out and then update.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const auth = getSupabaseBrowser().auth;
    let cancelled = false;
    void auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session));
    });
    const { data } = auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
