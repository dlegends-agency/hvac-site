import { z } from "zod";
import { HVAC_ISSUES, URGENCY_OPTIONS } from "@/config/services";
import { CONTACT_METHODS, PROPERTY_STATUSES, PROPERTY_TYPES, getCountry } from "@/config/form";

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

const issueSchema = z.object({
  issue: z.enum(HVAC_ISSUES, { error: "Please select the problem you are experiencing." }),
  urgency: z.enum(URGENCY_OPTIONS, { error: "Please tell us how urgently you need help." }),
});

// Cross-field checks live in per-step schemas: Zod skips an object-level refinement while
// other fields of the same object are invalid, so each step validates independently.
const locationSchema = z
  .object({
    country: required("Country"),
    state: required("State or province"),
    city: required("City"),
    postalCode: required("ZIP or postal code"),
    street: required("Street address"),
    unit: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const country = getCountry(data.country);
    if (data.postalCode && country.postalPattern && !country.postalPattern.test(data.postalCode.trim())) {
      ctx.addIssue({ code: "custom", path: ["postalCode"], message: `Enter a valid ${country.postalLabel}.` });
    }
  });

const contactSchema = z.object({
  country: z.string(),
  firstName: required("First name"),
  lastName: required("Last name"),
  phone: required("Phone number"),
  email: z.string().trim().min(1, "Email address is required.").email("Enter a valid email address."),
  contactMethod: z.enum(CONTACT_METHODS, { error: "Choose how you would like to be contacted." }),
});

const phoneSchema = z.object({ country: z.string(), phone: z.string() }).superRefine((data, ctx) => {
  const { phoneDigits } = getCountry(data.country);
  let digits = data.phone.replace(/\D/g, "");
  if (digits.length > phoneDigits[1] && digits.startsWith("1")) digits = digits.slice(1);
  if (data.phone && (digits.length < phoneDigits[0] || digits.length > phoneDigits[1])) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid phone number, including area code." });
  }
});

const detailsSchema = z.object({
  description: z.string().trim().max(2000, "Please keep this under 2,000 characters.").optional(),
  propertyType: z.enum(PROPERTY_TYPES, { error: "Select a property type." }),
  propertyStatus: z.enum(PROPERTY_STATUSES, { error: "Select your relationship to the property." }),
  preferredContactTime: z.string().trim().max(200).optional(),
});

const reviewSchema = z.object({
  referralAcknowledgment: z.boolean().refine((v) => v === true, {
    message: "Please acknowledge how your request will be handled to continue.",
  }),
  marketingConsent: z.boolean(),
});

export const leadSchema = issueSchema
  .and(locationSchema)
  .and(contactSchema)
  .and(phoneSchema)
  .and(detailsSchema)
  .and(reviewSchema);

export type LeadFormValues = z.infer<typeof leadSchema>;

/** Fields validated at each step, in order. */
export const stepFields: (keyof LeadFormValues)[][] = [
  ["issue", "urgency"],
  ["country", "state", "city", "postalCode", "street", "unit"],
  ["firstName", "lastName", "phone", "email", "contactMethod"],
  ["description", "propertyType", "propertyStatus", "preferredContactTime"],
  ["referralAcknowledgment", "marketingConsent"],
];

export const stepTitles = ["Issue", "Location", "Contact", "Details", "Review"];
