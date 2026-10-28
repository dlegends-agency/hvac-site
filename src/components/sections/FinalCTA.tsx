import { ArrowRight, Building2, ClipboardList, MapPin } from "lucide-react";
import { OpenFormButton } from "@/components/OpenFormButton";
import { reveal } from "@/lib/reveal";

const points = [
  { icon: Building2, text: "Independent contractors" },
  { icon: MapPin, text: "Local focus" },
  { icon: ClipboardList, text: "One simple request" },
];

/** Vector artwork: stays sharp at any size. */
function HouseArt() {
  return (
    <svg aria-hidden viewBox="0 0 420 260" className="h-full w-full" preserveAspectRatio="xMaxYMid meet">
      <defs>
        <linearGradient id="cta-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#274b8f" /><stop offset="1" stopColor="#1b3a73" /></linearGradient>
        <radialGradient id="cta-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#fcd34d" stopOpacity="0.9" /><stop offset="1" stopColor="#fcd34d" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="330" cy="60" r="70" fill="#38bdf8" opacity="0.12" />
      <circle cx="330" cy="60" r="36" fill="#7dd3fc" opacity="0.18" />
      <rect x="0" y="222" width="420" height="38" fill="#12284f" />
      <path d="M92 118 210 38l118 80z" fill="#0f2547" />
      <path d="M92 118 210 38l118 80" fill="none" stroke="#3b6fd0" strokeWidth="4" strokeLinejoin="round" />
      <rect x="112" y="118" width="196" height="104" fill="url(#cta-wall)" />
      <rect x="260" y="68" width="22" height="34" fill="#12284f" />
      <circle cx="152" cy="160" r="34" fill="url(#cta-glow)" /><circle cx="268" cy="160" r="34" fill="url(#cta-glow)" />
      <rect x="132" y="142" width="40" height="38" rx="4" fill="#fde68a" /><path d="M152 142v38M132 161h40" stroke="#1b3a73" strokeWidth="3" />
      <rect x="248" y="142" width="40" height="38" rx="4" fill="#fde68a" /><path d="M268 142v38M248 161h40" stroke="#1b3a73" strokeWidth="3" />
      <rect x="190" y="162" width="40" height="60" rx="4" fill="#0f2547" /><circle cx="222" cy="194" r="2.5" fill="#fcd34d" />
      <rect x="332" y="176" width="58" height="46" rx="6" fill="#dbeafe" /><rect x="332" y="170" width="58" height="9" rx="4.5" fill="#12284f" />
      <circle cx="361" cy="200" r="15" fill="#eff6ff" stroke="#1a56db" strokeWidth="3" /><path d="M361 200v-11M361 200l9 5M361 200l-9 5" stroke="#1a56db" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 222c0-22 14-34 30-34s30 12 30 34z" fill="#1d4d6b" opacity="0.7" />
    </svg>
  );
}

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="bg-white pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6" {...reveal()}>
        <div className="relative overflow-hidden rounded-3xl bg-navy">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 p-4 md:block"><HouseArt /></div>
          <div aria-hidden className="absolute -top-20 -left-20 size-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative p-8 sm:p-12 md:max-w-[58%]">
            <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Need Help With Your Heating or Cooling System?</h2>
            <p className="mt-3 max-w-lg text-blue-100">Tell us about your HVAC problem and location. We&apos;ll help you find suitable local repair options.</p>
            <div className="mt-6">
              <OpenFormButton variant="accent" className="group !rounded-full px-7 py-3.5 text-base hover:-translate-y-0.5 hover:shadow-xl">
                Submit a Service Request <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </OpenFormButton>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              {points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-sm font-medium text-blue-100"><Icon className="size-4 text-sky-300" aria-hidden /> {text}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
