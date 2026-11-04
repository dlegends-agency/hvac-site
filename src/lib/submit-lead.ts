import type { LeadFormValues } from "@/lib/lead-schema";
import { postForm } from "@/lib/post-form";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export type SubmitResult = "ok" | "not_configured" | "error";

/**
 * Sends a validated lead to /api/submit/lead, which checks the CAPTCHA and saves it (linked to the customer's account when they are
 * signed in). Visitors can submit but never read leads. In `npm run dev`, where there are no server functions, it inserts directly.
 */
export async function submitLead(values: LeadFormValues, idempotencyKey: string, source: string, captcha: string | null): Promise<SubmitResult> {
  if (!isSupabaseConfigured) return "not_configured";
  const row = {
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
  };
  const res = await postForm("/api/submit/lead", row, captcha, {
    devFallback: async () => {
      const { error } = await getSupabaseBrowser().from("leads").insert(row);
      // 23505 = duplicate idempotency key: this exact request was already stored.
      return !error || error.code === "23505";
    },
  });
  return res.ok ? "ok" : "error";
}
