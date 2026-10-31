import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { z } from "zod";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { breadcrumbLd, webPageLd } from "@/lib/schema";
import { slugify } from "@/lib/directory";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import { usePageMeta } from "@/lib/use-page-meta";

const schema = z.object({
  business_name: z.string().trim().min(2, "Enter your business name.").max(120),
  phone: z.string().trim().min(7, "Enter a phone number customers can call.").max(40),
  address: z.string().trim().min(3, "Enter your street address.").max(200),
  city: z.string().trim().min(1, "City is required.").max(100),
  state: z.string().trim().min(1, "State or province is required.").max(100),
  postal_code: z.string().trim().min(3, "Enter your ZIP or postal code.").max(20),
  submitter_name: z.string().trim().min(2, "Enter your name.").max(120),
  submitter_email: z.string().trim().email("Enter a valid email address.").max(200),
  consent: z.literal(true, { error: "Please confirm to continue." }),
});

type Errors = Partial<Record<string, string>>;

export default function AddBusinessPage() {
  usePageMeta({
    title: "List Your HVAC Business Free | HVACHelp",
    description: "List your heating and cooling business in the HVAC contractor directory for free: business name, phone number and address. Go Featured to show more.",
    path: "/directory/add",
    jsonLd: [
      webPageLd("List Your HVAC Business", "Add your heating and cooling business to the directory for free.", "/directory/add"),
      breadcrumbLd([{ name: "Home", path: "/" }, { name: "Directory", path: "/directory" }, { name: "List your business", path: "/directory/add" }]),
    ],
  });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const form = new FormData(e.currentTarget);
    if (form.get("fax_number")) return setStatus("done"); // honeypot: bots fill hidden fields

    const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    const result = schema.safeParse({ ...raw, consent: form.get("consent") === "on" });
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
    const d = result.data;
    const id = crypto.randomUUID();
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from("listings").insert({
      id,
      slug: `${slugify(`${d.business_name} ${d.city}`)}-${id.slice(0, 4)}`,
      status: "pending",
      business_name: d.business_name,
      phone: d.phone,
      address: d.address,
      city: d.city,
      state: d.state,
      postal_code: d.postal_code,
    });
    if (error) return setStatus("error");
    // Private contact details go in an admin-only table.
    await supabase.from("listing_private").insert({ listing_id: id, submitter_name: d.submitter_name, submitter_email: d.submitter_email });
    setStatus("done");
  }

  const text = (id: string, label: string, extra: { hint?: string; type?: string; auto?: string } = {}) => (
    <Field id={id} label={label} hint={extra.hint} error={errors[id]}>
      {(a) => <input id={id} name={id} type={extra.type ?? "text"} autoComplete={extra.auto} className={inputClass} {...a} />}
    </Field>
  );

  return (
    <>
      <Header />
      <main className="bg-surface py-12">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <Link to="/directory" className="text-sm font-semibold text-primary">← Back to the directory</Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy">List your HVAC business for free</h1>
          <p className="mt-2 text-slate-600">
            A free listing shows your business name, phone number and address in the directory. Submissions are reviewed before they appear. We don&apos;t verify licensing or
            insurance, and a listing isn&apos;t a guarantee of placement or leads.
          </p>
          <p className="mt-3 rounded-xl bg-blue-50 p-4 text-sm text-slate-700">
            Want to show your About us, services, service areas and Google reviews too? Create a contractor account after your listing is approved and go
            Featured. <Link to="/pricing" className="font-semibold text-primary underline">See plans</Link>.
          </p>

          {status === "done" ? (
            <div role="status" className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-green-900"><CheckCircle2 className="size-5" aria-hidden /> Submitted for review</h2>
              <p className="mt-2 text-sm text-green-900">Thanks. Once your listing is reviewed it may be published in the directory. We can&apos;t promise a review timeline.</p>
              <p className="mt-2 text-sm text-green-900">
                Next, <Link to="/contractor/login?mode=signup" className="font-semibold underline">create a contractor account</Link> to claim the listing, receive customer requests near you and manage your business.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {/* Honeypot: hidden from people, tempting for bots */}
              <div className="absolute -left-[9999px]" aria-hidden>
                <label>Fax number<input name="fax_number" tabIndex={-1} autoComplete="off" /></label>
              </div>

              <h2 className="font-semibold text-navy">Your business</h2>
              {text("business_name", "Business name", { auto: "organization" })}
              {text("phone", "Business phone number", { type: "tel", auto: "tel" })}
              {text("address", "Street address", { auto: "street-address" })}
              <div className="grid gap-4 sm:grid-cols-3">
                {text("city", "City", { auto: "address-level2" })}
                {text("state", "State", { auto: "address-level1" })}
                {text("postal_code", "ZIP code", { auto: "postal-code" })}
              </div>

              <h2 className="pt-2 font-semibold text-navy">Your contact details (private)</h2>
              <p className="-mt-3 text-sm text-slate-600">Only our team can see these. They are used if we need to follow up about your listing.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {text("submitter_name", "Your name", { auto: "name" })}
                {text("submitter_email", "Your email", { type: "email", auto: "email" })}
              </div>

              <div>
                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input id="consent" name="consent" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" aria-invalid={Boolean(errors.consent)} />
                  <span>I confirm I&apos;m authorized to list this business and the information provided is accurate. I understand listings are reviewed and may be declined or removed. See the <Link to="/terms-of-use" className="text-primary underline">Terms of Use</Link> and <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link>.</span>
                </label>
                {errors.consent && <p className="mt-1 text-sm font-medium text-red-700">{errors.consent}</p>}
              </div>

              <div role="alert">
                {status === "error" && <p className="text-sm font-medium text-red-700">We couldn&apos;t submit your listing. Please try again later.</p>}
              </div>
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" && <Loader2 className="size-4 animate-spin" aria-hidden />} Submit for review
              </Button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
