import { NextResponse } from "next/server";
import { leadSchema } from "@/lib/lead-schema";
import { getSupabaseServer } from "@/lib/supabase";

/**
 * Lead intake endpoint. Validated leads are inserted into Supabase (table `leads`, see
 * supabase/schema.sql). If Supabase isn't configured, LEAD_WEBHOOK_URL is used instead; with
 * neither, this responds 501 so the UI never shows a false success message.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid", message: "Invalid request body." }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid", message: "Some details are missing or invalid." }, { status: 422 });
  }
  const d = parsed.data;
  const source = typeof (body as { source?: unknown }).source === "string" ? (body as { source: string }).source : "homepage";

  const supabase = getSupabaseServer();
  if (supabase) {
    const { error } = await supabase.from("leads").insert({
      idempotency_key: request.headers.get("Idempotency-Key"),
      source,
      issue: d.issue,
      urgency: d.urgency,
      country: d.country,
      state: d.state,
      city: d.city,
      postal_code: d.postalCode,
      street: d.street,
      unit: d.unit || null,
      first_name: d.firstName,
      last_name: d.lastName,
      phone: d.phone,
      email: d.email,
      contact_method: d.contactMethod,
      description: d.description || null,
      property_type: d.propertyType,
      property_status: d.propertyStatus,
      preferred_contact_time: d.preferredContactTime || null,
      referral_acknowledgment: d.referralAcknowledgment,
      marketing_consent: d.marketingConsent,
    });
    // 23505 = duplicate idempotency key: the same request was already stored.
    if (error && error.code !== "23505") {
      console.error("Lead insert failed:", error.message);
      return NextResponse.json({ status: "error", message: "We couldn't save your request." }, { status: 502 });
    }
    return NextResponse.json({ status: "ok" });
  }

  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json({ status: "not_configured", message: "Lead delivery is not configured yet." }, { status: 501 });
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LEAD_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.LEAD_WEBHOOK_SECRET}` } : {}),
      },
      body: JSON.stringify({ ...d, submittedAt: new Date().toISOString(), source }),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", message: "We couldn't send your request." }, { status: 502 });
  }
}
