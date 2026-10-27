import { Check } from "lucide-react";
import { OpenFormButton } from "@/components/OpenFormButton";
import { buttonClass } from "@/components/ui/Button";

const benefits = [
  "Heating and cooling problems",
  "Residential and commercial",
  "Takes only a few minutes",
  "No need to compare multiple websites",
];

/** Original illustration (house, outdoor condenser, thermostat) so no stock or fake imagery is needed. */
function HvacIllustration() {
  return (
    <svg viewBox="0 0 480 380" role="img" aria-label="Illustration of a home with an outdoor air conditioning unit and an indoor thermostat" className="h-auto w-full rounded-3xl shadow-lg shadow-slate-900/10">
      <rect width="480" height="380" fill="#e8f0fb" />
      <circle cx="400" cy="70" r="34" fill="#ffe3cc" />
      <path d="M40 90h70a14 14 0 0 0 0-28 22 22 0 0 0-42-6 16 16 0 0 0-28 34z" fill="#fff" opacity=".9" />
      <rect y="300" width="480" height="80" fill="#cfddf1" />
      <rect y="300" width="480" height="6" fill="#b8cae4" />
      {/* house */}
      <path d="M60 300V170l130-92 130 92v130z" fill="#fff" stroke="#b5c4dc" strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 176 190 70l146 106" fill="none" stroke="#0b1f3a" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="90" y="200" width="70" height="60" rx="6" fill="#dbe8fa" stroke="#b5c4dc" strokeWidth="3" />
      <path d="M125 200v60M90 230h70" stroke="#b5c4dc" strokeWidth="3" />
      <rect x="205" y="215" width="60" height="85" rx="6" fill="#0b1f3a" />
      <circle cx="254" cy="260" r="4" fill="#ffd9b8" />
      {/* thermostat */}
      <rect x="276" y="190" width="34" height="34" rx="8" fill="#fff" stroke="#1d4ed8" strokeWidth="3" />
      <text x="293" y="212" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1d4ed8">72°</text>
      {/* outdoor unit */}
      <rect x="338" y="226" width="110" height="74" rx="10" fill="#fff" stroke="#8fa6c8" strokeWidth="3" />
      <rect x="338" y="218" width="110" height="14" rx="7" fill="#0b1f3a" />
      <circle cx="393" cy="268" r="25" fill="#f1f6fd" stroke="#1d4ed8" strokeWidth="3" />
      <g stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round">
        <path d="M393 268v-19M393 268l16 9M393 268l-16 9" />
      </g>
      <circle cx="393" cy="268" r="4" fill="#c2410c" />
      <rect x="350" y="300" width="10" height="7" rx="2" fill="#0b1f3a" />
      <rect x="426" y="300" width="10" height="7" rx="2" fill="#0b1f3a" />
      {/* heat / cool badges */}
      <g>
        <rect x="318" y="140" width="62" height="28" rx="14" fill="#dbeafe" />
        <path d="M335 154h12M341 148v12M337 150l8 8M345 150l-8 8" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
        <text x="365" y="158" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e40af">Cool</text>
      </g>
      <g>
        <rect x="392" y="140" width="62" height="28" rx="14" fill="#ffedd5" />
        <path d="M410 160c-5-3-6-8-3-12 1 3 3 4 4 4-1-4 1-7 4-9 0 5 5 7 5 12 0 3-3 5-6 5z" fill="#c2410c" />
        <text x="436" y="158" textAnchor="middle" fontSize="11" fontWeight="700" fill="#9a3412">Heat</text>
      </g>
    </svg>
  );
}

export function HeroSection() {
  return (
    <section id="top" aria-labelledby="hero-title" className="bg-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <p className="inline-flex rounded-full bg-emergency-soft px-3 py-1 text-sm font-semibold text-emergency">
            Heating and AC trouble
          </p>
          <h1 id="hero-title" className="mt-4 text-4xl font-extrabold tracking-tight text-navy sm:text-5xl">
            Need Emergency HVAC Repair?
          </h1>
          <p className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">Find Help From Local HVAC Contractors.</p>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-700">
            Having trouble with your heating or air conditioning system? Tell us what&apos;s happening and where you&apos;re located.
            We&apos;ll help you find a suitable local contractor for your repair needs.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <OpenFormButton className="px-7 py-4 text-lg">Find HVAC Help</OpenFormButton>
            <a href="#how-it-works" className={buttonClass("secondary", "px-7 py-4 text-lg")}>How It Works</a>
          </div>
          <p className="mt-5 max-w-xl text-sm text-slate-600">
            One simple request. Your HVAC problem and location. We&apos;ll help you explore suitable local repair options.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm font-medium text-navy">
                <Check className="size-4 shrink-0 text-primary" aria-hidden /> {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto w-full max-w-md lg:max-w-none">
          <HvacIllustration />
        </div>
      </div>
    </section>
  );
}
