import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, Mail, MapPin, Phone, ShieldAlert } from "lucide-react";
import { z } from "zod";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { Button, buttonClass } from "@/components/ui/Button";
import { Field, SelectWrap, inputClass } from "@/components/ui/Field";
import { siteConfig } from "@/config/site";
import { breadcrumbLd, webPageLd } from "@/lib/schema";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { usePageMeta } from "@/lib/use-page-meta";

const TOPICS = [
  "General question",
  "Correct or remove a business listing",
  "Question about my service request",
  "Privacy request",
  "Report a problem with the site",
  "Other",
] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  topic: z.enum(TOPICS, { error: "Choose a topic." }),
  message: z.string().trim().min(10, "Please write at least a few words.").max(3000, "Please keep your message under 3,000 characters."),
  consent: z.literal(true, { error: "Please confirm to continue." }),
});

type Errors = Partial<Record<string, string>>;

export default function ContactPage() {
  const { brand, contact } = siteConfig;
  const title = `Contact Us | ${brand.name}`;
  const description = `Contact ${brand.name} with questions, listing corrections or privacy requests. For HVAC repair help, use our request form.`;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }];
  usePageMeta({
    title, description, path: "/contact",
    jsonLd: [{ ...webPageLd(title, description, "/contact"), "@type": "ContactPage" }, breadcrumbLd(crumbs)],
  });

  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const form = new FormData(e.currentTarget);
    if (form.get("website_url")) return setStatus("done"); // honeypot: bots fill hidden fields

    const result = schema.safeParse({
      name: form.get("name"), email: form.get("email"), topic: form.get("topic"), message: form.get("message"), consent: form.get("consent") === "on",
    });
    if (!result.success) {
      const next: Errors = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      document.getElementById(Object.keys(next)[0])?.focus();
      return;
    }
    setErrors({});
    if (!isSupabaseConfigured) return setStatus("error");

    setStatus("submitting");
    const { name, email, topic, message } = result.data;
    const { error } = await getSupabaseBrowser().from("contact_messages").insert({ name, email, topic, message });
    setStatus(error ? "error" : "done");
  }

  const cards = [
    contact.email && { icon: Mail, label: "Email", value: contact.email, href: `mailto:${contact.email}` },
    contact.phone && contact.phoneHref && { icon: Phone, label: "Phone", value: contact.phone, href: contact.phoneHref },
    contact.address && { icon: MapPin, label: "Mailing address", value: contact.address },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href?: string }[];

  return (
    <>
      <Header />
      <main className="bg-surface py-12">
        <div className="mx-auto max-w-site px-4 sm:px-6">
          <Breadcrumbs crumbs={crumbs} />
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-navy">Contact Us</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Questions, corrections to a business listing, or a privacy request? Send us a message and we&apos;ll get back to you where we can.
          </p>

          <div className="mt-10 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-orange-200 bg-emergency-soft p-5">
                <p className="flex items-center gap-2 font-semibold text-navy"><ShieldAlert className="size-5 text-emergency" aria-hidden /> Gas smell or carbon monoxide alarm?</p>
                <p className="mt-1.5 text-sm text-slate-800">
                  Leave the area and contact your gas utility or local emergency services from a safe place. Do not use this form for emergencies.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="font-semibold text-navy">Need HVAC repair help?</p>
                <p className="mt-1.5 text-sm text-slate-600">This form is for general questions. To request help finding a contractor, use the service request form instead.</p>
                <Link to="/#lead-form" className={buttonClass("primary", "mt-3 !rounded-full !px-5 !py-2.5 text-sm")}>Find HVAC Help</Link>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="font-semibold text-navy">A business owner?</p>
                <p className="mt-1.5 text-sm text-slate-600">
                  <Link to="/directory/add" className="font-semibold text-primary hover:underline">Submit your business</Link> for the directory, or use the form to ask us to correct or remove an existing listing.
                </p>
              </div>

              {cards.length > 0 && (
                <ul className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {cards.map(({ icon: Icon, label, value, href }) => (
                    <li key={label} className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary" aria-hidden><Icon className="size-4" /></span>
                      <span>
                        <span className="block text-sm font-semibold text-navy">{label}</span>
                        {href ? <a href={href} className="text-sm text-primary hover:underline">{value}</a> : <span className="text-sm text-slate-700">{value}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="flex items-start gap-2 text-sm text-slate-600">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> We can&apos;t promise a response time, but we read every message.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5 sm:p-8">
              {status === "done" ? (
                <div role="status" className="anim-step text-center">
                  <span className="anim-pop mx-auto grid size-14 place-items-center rounded-full bg-green-600 text-white"><CheckCircle2 className="size-8" aria-hidden /></span>
                  <h2 className="mt-4 text-xl font-bold text-navy">Message sent</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">Thanks for getting in touch. We&apos;ll reply to the email address you gave us if a reply is needed.</p>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate className="space-y-5">
                  <h2 className="text-xl font-bold text-navy">Send us a message</h2>
                  <div className="absolute -left-[9999px]" aria-hidden>
                    <label>Website<input name="website_url" tabIndex={-1} autoComplete="off" /></label>
                  </div>
                  <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                    <Field id="name" label="Your name" error={errors.name}>
                      {(a) => <input id="name" name="name" autoComplete="name" className={inputClass} {...a} />}
                    </Field>
                    <Field id="email" label="Email address" error={errors.email}>
                      {(a) => <input id="email" name="email" type="email" autoComplete="email" className={inputClass} {...a} />}
                    </Field>
                  </div>
                  <Field id="topic" label="Topic" error={errors.topic}>
                    {(a) => (
                      <SelectWrap>
                        <select id="topic" name="topic" defaultValue={TOPICS[0]} className={inputClass} {...a}>
                          {TOPICS.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </SelectWrap>
                    )}
                  </Field>
                  <Field id="message" label="Message" error={errors.message}>
                    {(a) => <textarea id="message" name="message" rows={6} className={inputClass} {...a} />}
                  </Field>
                  <div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm text-slate-800">
                      <input id="consent" name="consent" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" aria-invalid={Boolean(errors.consent)} />
                      <span>I agree that {brand.name} may use these details to reply to my message, as described in the <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link>.</span>
                    </label>
                    {errors.consent && <p className="anim-fade-in mt-1.5 text-sm font-medium text-red-700">{errors.consent}</p>}
                  </div>
                  <div role="alert">
                    {status === "error" && <p className="text-sm font-medium text-red-700">We couldn&apos;t send your message. Please try again later.</p>}
                  </div>
                  <Button type="submit" disabled={status === "submitting"} className="!rounded-full px-8 shadow-lg shadow-blue-600/20">
                    {status === "submitting" && <Loader2 className="size-4 animate-spin" aria-hidden />} Send message
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
