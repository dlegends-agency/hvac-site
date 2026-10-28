import { Link } from "react-router-dom";
import { Building2, CalendarClock, ClipboardList, Droplets, Flame, Gauge, Home, MapPin, Power, Siren, Snowflake, Thermometer, User, Volume2, Wrench, Zap, Clock, type LucideIcon } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import type { LeadFormValues } from "@/lib/lead-schema";
import { HVAC_ISSUES, URGENCY_OPTIONS } from "@/config/services";
import { CONTACT_METHODS, PROPERTY_STATUSES, PROPERTY_TYPES, countries, getCountry } from "@/config/form";
import { Field, SelectWrap, inputClass } from "@/components/ui/Field";
import { RadioCards } from "@/components/ui/RadioCards";

type F = UseFormReturn<LeadFormValues>;

const issueIcons: Record<string, LucideIcon> = {
  "AC Not Cooling": Snowflake,
  "AC Not Turning On": Power,
  "Furnace Not Heating": Flame,
  "No Heating or Cooling": Thermometer,
  "HVAC Making Strange Noises": Volume2,
  "Water Leaking From HVAC": Droplets,
  "Thermostat Problem": Gauge,
  "Emergency Heating Repair": Siren,
  "Emergency AC Repair": Siren,
  "Commercial HVAC Problem": Building2,
  Other: Wrench,
};

const urgencyIcons: Record<string, LucideIcon> = {
  Immediately: Zap,
  "As soon as possible": Clock,
  "Flexible timing": CalendarClock,
};

export function IssueStep({ form }: { form: F }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-7">
      <RadioCards legend="What problem are you experiencing?" name="issue" options={HVAC_ISSUES} icons={issueIcons}
        register={register("issue")} error={errors.issue?.message} />
      <RadioCards legend="How urgently do you need help?" name="urgency" options={URGENCY_OPTIONS} icons={urgencyIcons} variant="pills"
        urgent={["Immediately"]} register={register("urgency")} error={errors.urgency?.message} columns="grid-cols-1 sm:grid-cols-3" />
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Your selection helps us understand your request. It doesn&apos;t confirm that a contractor is available.
      </p>
    </div>
  );
}

export function LocationStep({ form }: { form: F }) {
  const { register, watch, formState: { errors } } = form;
  const country = getCountry(watch("country"));
  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <Field id="country" label="Country" error={errors.country?.message}>
        {(a) => (
          <SelectWrap>
            <select id="country" autoComplete="country" className={inputClass} {...a} {...register("country")}>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </SelectWrap>
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
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <Field id="firstName" label="First name" error={errors.firstName?.message}>
        {(a) => <input id="firstName" autoComplete="given-name" className={inputClass} {...a} {...register("firstName")} />}
      </Field>
      <Field id="lastName" label="Last name" error={errors.lastName?.message}>
        {(a) => <input id="lastName" autoComplete="family-name" className={inputClass} {...a} {...register("lastName")} />}
      </Field>
      <Field id="phone" label="Phone number" error={errors.phone?.message}>
        {(a) => <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" className={inputClass} {...a} {...register("phone")} />}
      </Field>
      <Field id="email" label="Email address" error={errors.email?.message}>
        {(a) => <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" className={inputClass} {...a} {...register("email")} />}
      </Field>
      <div className="sm:col-span-2">
        <RadioCards legend="Preferred contact method" name="contactMethod" options={CONTACT_METHODS} variant="pills"
          register={register("contactMethod")} error={errors.contactMethod?.message} columns="grid-cols-3" />
      </div>
    </div>
  );
}

export function DetailsStep({ form }: { form: F }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-6">
      <Field id="description" label="Can you tell us a little more about the problem?" optional error={errors.description?.message}>
        {(a) => <textarea id="description" rows={4} placeholder="What have you noticed, and when did it start?" className={inputClass} {...a} {...register("description")} />}
      </Field>
      <RadioCards legend="Property type" name="propertyType" options={PROPERTY_TYPES} variant="pills"
        register={register("propertyType")} error={errors.propertyType?.message} columns="grid-cols-2" />
      <RadioCards legend="Your relationship to the property" name="propertyStatus" options={PROPERTY_STATUSES} variant="pills"
        register={register("propertyStatus")} error={errors.propertyStatus?.message} columns="grid-cols-2 sm:grid-cols-4" />
      <Field id="preferredContactTime" label="Preferred contact time" optional hint="For example: weekdays after 5 pm."
        error={errors.preferredContactTime?.message}>
        {(a) => <input id="preferredContactTime" className={inputClass} {...a} {...register("preferredContactTime")} />}
      </Field>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value, onEdit, editLabel }: { icon: LucideIcon; label: string; value: string; onEdit: () => void; editLabel: string }) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary" aria-hidden><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-semibold text-navy">{label}</dt>
        <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-700">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} aria-label={editLabel}
        className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-blue-50">
        Edit
      </button>
    </div>
  );
}

const checkboxLabel = "flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm text-slate-800 transition-colors hover:border-slate-300 has-[:checked]:border-primary/40 has-[:checked]:bg-blue-50/60";

export function ReviewStep({ form, goTo, devMode }: { form: F; goTo: (step: number) => void; devMode: boolean }) {
  const { register, getValues, formState: { errors } } = form;
  const v = getValues();
  const country = getCountry(v.country);
  const address = [v.street, v.unit, `${v.city}, ${v.state} ${v.postalCode}`, country.name].filter(Boolean).join("\n");
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
        <SummaryRow icon={ClipboardList} label="HVAC issue" value={`${v.issue}\nUrgency: ${v.urgency}`} onEdit={() => goTo(0)} editLabel="Edit HVAC issue" />
        <SummaryRow icon={MapPin} label="Service location" value={address} onEdit={() => goTo(1)} editLabel="Edit service location" />
        <SummaryRow icon={User} label="Contact details" value={`${v.firstName} ${v.lastName}\n${v.phone}\n${v.email}\nPrefers: ${v.contactMethod}`}
          onEdit={() => goTo(2)} editLabel="Edit contact details" />
        <SummaryRow icon={Home} label="Property" value={`${v.propertyType} · ${v.propertyStatus}${v.description ? `\n${v.description}` : ""}`}
          onEdit={() => goTo(3)} editLabel="Edit additional information" />
      </dl>

      <div className="space-y-3">
        <div>
          <label className={checkboxLabel}>
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary"
              aria-describedby={errors.referralAcknowledgment ? "ack-error" : undefined}
              aria-invalid={Boolean(errors.referralAcknowledgment)} {...register("referralAcknowledgment")} />
            <span>
              I understand this website facilitates referrals and may share the information I submitted with suitable
              independent contractors so they can respond to my request. <span className="font-semibold">(Required)</span>
            </span>
          </label>
          {errors.referralAcknowledgment && (
            <p id="ack-error" className="anim-fade-in mt-1.5 text-sm font-medium text-red-700">{errors.referralAcknowledgment.message}</p>
          )}
        </div>
        <label className={checkboxLabel}>
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" {...register("marketingConsent")} />
          <span>I&apos;d also like to receive offers and updates about HVAC services. <span className="text-slate-500">(Optional)</span></span>
        </label>
      </div>

      <p className="text-xs text-slate-500">
        See our <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link> and <Link to="/terms-of-use" className="text-primary underline">Terms of Use</Link>.
      </p>

      {devMode && (
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          <strong>Development mode:</strong> no lead backend is connected yet, so submitting will not send a real request.
        </p>
      )}
    </div>
  );
}
