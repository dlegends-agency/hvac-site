// Shared helpers for the Stripe Pages Functions. No SDK: Stripe's REST API is called with fetch, so it runs on Cloudflare Workers as is.

export interface Env {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SITE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string; // encrypted Cloudflare secret; used only here, never sent to the browser
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_FEATURED?: string;
  STRIPE_PRICE_PREMIUM?: string;
  RESEND_API_KEY?: string; // email alerts (resend.com), encrypted secret
  NOTIFY_FROM_EMAIL?: string; // for example "HVACHelp <leads@yourdomain.com>" (a domain verified in Resend)
  NOTIFY_SECRET?: string; // shared with the database and the scheduled workflow so only they can trigger sending
  GOOGLE_PLACES_API_KEY?: string; // encrypted Cloudflare secret, restricted to the Places API and given a daily quota in Google Cloud
}

export type Plan = "featured" | "premium";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const isPlan = (v: unknown): v is Plan => v === "featured" || v === "premium";

export function priceFor(env: Env, plan: Plan): string | undefined {
  return plan === "featured" ? env.STRIPE_PRICE_FEATURED : env.STRIPE_PRICE_PREMIUM;
}

export function planForPrice(env: Env, priceId: string | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_FEATURED) return "featured";
  if (priceId === env.STRIPE_PRICE_PREMIUM) return "premium";
  return null;
}

/** Calls the Stripe REST API: a form-encoded body for POST, the query string for GET. */
export async function stripe<T>(env: Env, method: "GET" | "POST", path: string, params?: Record<string, string>): Promise<T> {
  const query = method === "GET" && params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`https://api.stripe.com/v1${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" && params ? new URLSearchParams(params).toString() : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message ?? "request failed"}`);
  return data;
}

/** Identifies the signed-in user from their Supabase access token. */
export async function getUser(env: Env, request: Request): Promise<{ id: string; email: string } | null> {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) return null;
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string; email?: string };
  return u.id ? { id: u.id, email: u.email ?? "" } : null;
}

/** Supabase REST call using the service role key (server side only). */
export function db(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export async function ownedListingId(env: Env, userId: string): Promise<string | null> {
  const res = await db(env, `listing_owners?user_id=eq.${encodeURIComponent(userId)}&select=listing_id&limit=1`);
  if (!res.ok) return null;
  const rows = (await res.json()) as { listing_id: string }[];
  return rows[0]?.listing_id ?? null;
}

export interface BillingRow {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
}

export async function billingFor(env: Env, listingId: string): Promise<BillingRow | null> {
  const res = await db(env, `listing_billing?listing_id=eq.${encodeURIComponent(listingId)}&select=stripe_customer_id,stripe_subscription_id,status&limit=1`);
  if (!res.ok) return null;
  return ((await res.json()) as BillingRow[])[0] ?? null;
}

export const siteOrigin = (env: Env, request: Request) => (env.VITE_SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");

// ---------------------------------------------------------------- webhook signature
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies a Stripe-Signature header ("t=...,v1=...") against the raw request body. Rejects stale timestamps (replay protection). */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || signatures.length === 0 || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  return signatures.some((s) => safeEqual(s, expected));
}

// ---------------------------------------------------------------- subscription -> listing plan
export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: { price?: { id: string }; current_period_end?: number }[] };
}

const ENTITLED = new Set(["active", "trialing", "past_due"]);

/** What a subscription entitles the listing to. past_due keeps the plan until the paid period ends. */
export function entitlement(env: Env, sub: StripeSubscription): { plan: "free" | Plan; until: string | null } {
  const item = sub.items?.data[0];
  const plan = planForPrice(env, item?.price?.id);
  const end = sub.current_period_end ?? item?.current_period_end;
  if (!plan || !ENTITLED.has(sub.status) || !end) return { plan: "free", until: null };
  return { plan, until: new Date(end * 1000).toISOString() };
}
