import { ArrowRight, Building2, MapPin, ClipboardList } from "lucide-react";
import { OpenFormButton } from "@/components/OpenFormButton";

const points = [
  { icon: Building2, text: "Independent contractors" },
  { icon: MapPin, text: "Local focus" },
  { icon: ClipboardList, text: "One simple request" },
];

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="bg-white pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-navy">
          <img src="/images/cta-house.jpg" alt="" width={636} height={276} loading="lazy" decoding="async"
            className="absolute inset-y-0 right-0 hidden h-full w-3/5 object-cover opacity-70 md:block" />
          <div aria-hidden className="absolute inset-0 hidden bg-gradient-to-r from-navy via-navy/90 to-transparent md:block" />
          <div className="relative grid gap-6 p-8 sm:p-12 md:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Need Help With Your Heating or Cooling System?</h2>
              <p className="mt-3 max-w-lg text-blue-100">Tell us about your HVAC problem and location. We&apos;ll help you find suitable local repair options.</p>
              <div className="mt-6">
                <OpenFormButton variant="accent" className="!rounded-full px-7 py-3.5 text-base">Submit a Service Request <ArrowRight className="size-4" aria-hidden /></OpenFormButton>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                {points.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-sm font-medium text-blue-100"><Icon className="size-4 text-sky-300" aria-hidden /> {text}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
