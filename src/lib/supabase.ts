import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let browserClient: SupabaseClient | null = null;

/** Browser client (session kept in localStorage). Access control is enforced by RLS, not by this key. */
export function getSupabaseBrowser(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured.");
  return (browserClient ??= createClient(url, key));
}

/** Stateless client for server routes. */
export function getSupabaseServer(): SupabaseClient | null {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
