import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Browser client (session kept in localStorage). Access control is enforced by RLS, not by this key. */
export function getSupabaseBrowser(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured.");
  return (client ??= createClient(url, key));
}
