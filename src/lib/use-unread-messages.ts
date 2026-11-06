import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

/** Unread messages for the signed-in person (0 when signed out or when messages are not switched on yet). */
export function useUnreadMessages(): { customer: number; business: number } {
  const [n, setN] = useState({ customer: 0, business: 0 });
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    const supabase = getSupabaseBrowser();
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data, error } = await supabase.rpc("my_unread_messages");
      if (live && !error && data) setN({ customer: Number((data as { as_customer: number }).as_customer) || 0, business: Number((data as { as_business: number }).as_business) || 0 });
    })();
    return () => {
      live = false;
    };
  }, []);
  return n;
}
