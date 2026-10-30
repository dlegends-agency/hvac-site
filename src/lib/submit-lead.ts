import type { LeadFormValues } from "@/lib/lead-schema";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export type SubmitResult = "ok" | "not_configured" | "error";

/**
 * Inserts a validated lead into Supabase. The `leads` table's RLS policy allows anonymous INSERT only,
 * so visitors can submit but never read leads. See supabase/schema.sql.
 */
export async function submitLead(values: LeadFormValues, idempotencyKey: string, source: string): Promise<SubmitResult> {
  if (!isSupabaseConfigured) return "not_configured";
  const { error } = await getSupabaseBrowser().from("leads").insert({
    idempotency_key: idempotencyKey,
    source,
    issue: values.issues.join(", "),
    urgency: values.urgency,
    country: values.country,
    state: values.state,
    city: values.city,
    postal_code: values.postalCode,
    street: values.street,
    unit: values.unit || null,
    first_name: values.firstName,
    last_name: values.lastName,
    phone: values.phone,
    email: values.email,
    contact_method: values.contactMethod,
    description: values.description || null,
    property_type: values.propertyType,
    property_status: values.propertyStatus,
    preferred_contact_time: values.preferredContactTime || null,
    referral_acknowledgment: values.referralAcknowledgment,
    marketing_consent: values.marketingConsent,
  });
  // 23505 = duplicate idempotency key: this exact request was already stored.
  if (error && error.code !== "23505") return "error";
  return "ok";
}
