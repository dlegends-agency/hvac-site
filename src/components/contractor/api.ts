import { getSupabaseBrowser } from "@/lib/supabase";

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  error?: string;
  data: T;
}

/** POST to one of our server functions with the signed-in user's token. Never throws. */
export async function callApi<T = Record<string, unknown>>(path: string, body: unknown): Promise<ApiResult<T>> {
  const { data } = await getSupabaseBrowser().auth.getSession();
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { status: res.status, error: json.error, data: json };
  } catch {
    return { status: 0, error: "network", data: {} as T };
  }
}
