import type { UseFormReturn } from "react-hook-form";
import type { LeadFormValues } from "@/lib/lead-schema";
import { HVAC_ISSUES, URGENCY_OPTIONS } from "@/config/services";
import { CONTACT_METHODS, PROPERTY_STATUSES, PROPERTY_TYPES, countries, getCountry } from "@/config/form";
import { Field, inputClass } from "@/components/ui/Field";
import { RadioCards } from "@/components/ui/RadioCards";

type F = UseFormReturn<LeadFormValues>;

export function IssueStep({ form }: { form: F }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-6">
      <RadioCards legend="What problem are you experiencing?" name="issue" options={HVAC_ISSUES}
        register={register("issue")} error={errors.issue?.message} />
      <RadioCards legend="How urgently do you need help?" name="urgency" options={URGENCY_OPTIONS}
        register={register("urgency")} error={errors.urgency?.message} columns="sm:grid-cols-3" />
      <p className="text-sm text-slate-600">
        Your selection helps us understand your request. It doesn&apos;t confirm that a contractor is available.
      </p>
    </div>
  );
}

export function LocationStep({ form }: { form: F }) {
  const { register, watch, formState: { errors } } = form;
  const country = getCountry(watch("country"));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="country" label="Country" error={errors.country?.message}>
        {(a) => (
          <select id="country" autoComplete="country" className={inputClass} {...a} {...register("country")}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        )}
      </Field>
      <Field id="state" label={country.regionLabel} error={errors.state?.message}>
        {(a) => <input id="state" autoComplete="address-level1" className={inputClass} {...a} {...register("state")} />}
      </Field>
      <Field id="city" label="City" error={errors.city?.message}>
        {(a) => <input id="city" autoComplete="address-level2" className={inputClass} {...a} {...register("city")} />}
      </Field>
      <Field id="postalCode" label={country.postalLabel} error={errors.postalCode?.message}>
        {(a) => <input id="postalCode" autoComplete="postal-code" inputMode="text" className={inputClass} {...a} {...register("postalCode")} />}
      </Field>
      <Field id="street" label="Street address" error={errors.street?.message} className="sm:col-span-2">
        {(a) => <input id="street" autoComplete="address-line1" className={inputClass} {...a} {...register("street")} />}
      </Field>
      <Field id="unit" label="Apartment or unit number" optional error={errors.unit?.message} className="sm:col-span-2">
        {(a) => <input id="unit" autoComplete="address-line2" className={inputClass} {...a} {...register("unit")} />}
      </Field>
    </div>
  );
}

export function ContactStep({ form }: { form: F }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="firstName" label="First name" error={errors.firstName?.message}>
        {(a) => <input id="firstName" autoComplete="given-name" className={inputClass} {...a} {...register("firstName")} />}
      </Field>
      <Field id="lastName" label="Last name" error={errors.lastName?.message}>
        {(a) => <input id="lastName" autoComplete="family-name" className={inputClass} {...a} {...register("lastName")} />}
      </Field>
      <Field id="phone" label="Phone number" error={errors.phone?.message}>
        {(a) => <input id="phone" type="tel" inputMode="tel" autoComplete="tel" className={inputClass} {...a} {...register("phone")} />}
      </Field>
      <Field id="email" label="Email address" error={errors.email?.message}>
        {(a) => <input id="email" type="email" inputMode="email" autoComplete="email" className={inputClass} {...a} {...register("email")} />}
      </Field>
      <div className="sm:col-span-2">
        <RadioCards legend="Preferred contact method" name="contactMethod" options={CONTACT_METHODS}
          register={register("contactMethod")} error={errors.contactMethod?.message} columns="sm:grid-cols-3" />
      </div>
    </div>
  );
}

export function DetailsStep({ form }: { form: F }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-5">
      <Field id="description" label="Can you tell us a little more about the problem?" optional error={errors.description?.message}>
        {(a) => <textarea id="description" rows={4} className={inputClass} {...a} {...register("description")} />}
      </Field>
      <RadioCards legend="Property type" name="propertyType" options={PROPERTY_TYPES}
        register={register("propertyType")} error={errors.propertyType?.message} />
      <RadioCards legend="Your relationship to the property" name="propertyStatus" options={PROPERTY_STATUSES}
        register={register("propertyStatus")} error={errors.propertyStatus?.message} columns="sm:grid-cols-4" />
      <Field id="preferredContactTime" label="Preferred contact time" optional hint="For example: weekdays after 5 pm."
        error={errors.preferredContactTime?.message}>
        {(a) => <input id="preferredContactTime" className={inputClass} {...a} {...register("preferredContactTime")} />}
      </Field>
    </div>
  );
}

function SummaryRow({ label, value, onEdit, editLabel }: { label: string; value: string; onEdit: () => void; editLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-sm font-semibold text-navy">{label}</dt>
        <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-700">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} aria-label={editLabel}
        className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary hover:bg-blue-50">
        Edit
      </button>
    </div>
  );
}

export function ReviewStep({ form, goTo, devMode }: { form: F; goTo: (step: number) => void; devMode: boolean }) {
  const { register, getValues, formState: { errors } } = form;
  const v = getValues();
  const country = getCountry(v.country);
  const address = [v.street, v.unit, `${v.city}, ${v.state} ${v.postalCode}`, country.name].filter(Boolean).join("\n");
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 px-4">
        <SummaryRow label="HVAC issue" value={`${v.issue}\nUrgency: ${v.urgency}`} onEdit={() => goTo(0)} editLabel="Edit HVAC issue" />
        <SummaryRow label="Service location" value={address} onEdit={() => goTo(1)} editLabel="Edit service location" />
        <SummaryRow label="Contact details" value={`${v.firstName} ${v.lastName}\n${v.phone}\n${v.email}\nPrefers: ${v.contactMethod}`}
          onEdit={() => goTo(2)} editLabel="Edit contact details" />
        <SummaryRow label="Property" value={`${v.propertyType} · ${v.propertyStatus}${v.description ? `\n${v.description}` : ""}`}
          onEdit={() => goTo(3)} editLabel="Edit additional information" />
      </dl>

      <div className="space-y-3">
        <div>
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary"
              aria-describedby={errors.referralAcknowledgment ? "ack-error" : undefined}
              aria-invalid={Boolean(errors.referralAcknowledgment)} {...register("referralAcknowledgment")} />
            <span>
              I understand this website facilitates referrals and may share the information I submitted with suitable
              independent contractors so they can respond to my request. <span className="font-semibold">(Required)</span>
            </span>
          </label>
          {errors.referralAcknowledgment && (
            <p id="ack-error" className="mt-1 text-sm font-medium text-red-700">{errors.referralAcknowledgment.message}</p>
          )}
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-800">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" {...register("marketingConsent")} />
          <span>I&apos;d also like to receive offers and updates about HVAC services. <span className="text-slate-500">(Optional)</span></span>
        </label>
      </div>

      {devMode && (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          <strong>Development mode:</strong> no lead backend is connected yet, so submitting will not send a real request.
        </p>
      )}
    </div>
  );
}
