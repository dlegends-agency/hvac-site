import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, MapPin, Play, Snowflake, Wrench } from "lucide-react";
import { OpenFormButton } from "@/components/OpenFormButton";
import { buttonClass } from "@/components/ui/Button";
import { delay } from "@/lib/reveal";

const points = ["Heating and cooling problems", "Residential and commercial", "Takes only a few minutes"];

function FloatCard({ icon: Icon, title, text, className, d }: { icon: typeof MapPin; title: string; text: string; className: string; d: number }) {
  return (
    <div className={`absolute z-10 hidden items-center gap-3 rounded-2xl bg-white/95 p-3 pr-4 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100 backdrop-blur anim-float sm:flex ${className}`} style={delay(d)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary" aria-hidden><Icon className="size-5" /></span>
      <span className="leading-tight"><span className="block text-sm font-bold text-navy">{title}</span><span className="text-xs text-slate-600">{text}</span></span>
    </div>
  );
}

export function HeroSection() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-b from-sky-50 via-sky-50/60 to-white">
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-sky-100/80 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-0 bottom-0 size-72 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="relative mx-auto grid max-w-site items-center gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <p className="anim-fade-up inline-flex rounded-md bg-orange-100 px-3 py-1 text-xs font-bold tracking-wider text-emergency uppercase">
            Heating &amp; AC help, made simple
          </p>
          <h1 id="hero-title" className="anim-fade-up mt-5 text-4xl font-extrabold tracking-tight text-navy sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]" style={delay(80)}>
            Need Emergency HVAC Repair?
          </h1>
          <p className="anim-fade-up mt-4 text-xl font-medium text-navy sm:text-2xl" style={delay(160)}>Find Help From Local HVAC Contractors.</p>
          <p className="anim-fade-up mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg" style={delay(240)}>
            Having trouble with your heating or air conditioning system? Tell us what&apos;s happening and where you&apos;re located.
            We&apos;ll help you find a suitable local contractor for your repair needs.
          </p>
          <div className="anim-fade-up mt-7 flex flex-col gap-3 sm:flex-row" style={delay(320)}>
            <OpenFormButton className="group !rounded-full px-7 py-3.5 text-base shadow-lg shadow-blue-600/25 hover:-translate-y-0.5 hover:shadow-xl">
              Find HVAC Help <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </OpenFormButton>
            <Link to="/#how-it-works" className={buttonClass("secondary", "group !rounded-full px-7 py-3.5 text-base !text-primary hover:-translate-y-0.5")}>
              <Play className="size-4 fill-current" aria-hidden /> How It Works
            </Link>
          </div>
          <p className="anim-fade-up mt-5 max-w-xl text-sm text-slate-600" style={delay(400)}>
            One simple request. Your HVAC problem and location. We&apos;ll help you explore suitable local repair options.
          </p>
          <ul className="anim-fade-up mt-6 flex flex-wrap gap-x-6 gap-y-2" style={delay(480)}>
            {points.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm font-semibold text-navy">
                <span className="grid size-5 place-items-center rounded-full bg-blue-100 text-primary" aria-hidden><Check className="size-3" strokeWidth={3} /></span> {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="anim-fade-in relative mx-auto w-full max-w-xl py-6" style={delay(200)}>
          <div aria-hidden className="absolute inset-x-6 inset-y-0 rotate-3 rounded-[2.5rem] bg-gradient-to-br from-sky-200/80 via-blue-100/60 to-white" />
          <div aria-hidden className="anim-spin-slow absolute top-0 right-10 size-24 rounded-full border-2 border-dashed border-sky-300" />
          <svg aria-hidden viewBox="0 0 96 96" className="absolute bottom-2 left-2 size-20 text-sky-300" fill="currentColor">
            {Array.from({ length: 25 }, (_, i) => <circle key={i} cx={10 + (i % 5) * 19} cy={10 + Math.floor(i / 5) * 19} r="2.4" />)}
          </svg>
          <div className="relative overflow-hidden rounded-[2rem] shadow-2xl shadow-blue-900/20 ring-[10px] ring-white">
            <img src="/images/hero.jpg" alt="Technician servicing an outdoor air conditioning unit at a home" width={1400} height={1186}
              fetchPriority="high" decoding="async" className="aspect-[1400/1186] w-full object-cover" />
          </div>
          <FloatCard icon={MapPin} title="Local Contractors" text="Search by your area" className="top-12 -left-3 lg:-left-8" d={0} />
          <FloatCard icon={Building2} title="Independent Businesses" text="Not employed by us" className="top-[55%] -right-3 lg:-right-8" d={1200} />
          <FloatCard icon={Wrench} title="Repairs & Installations" text="Heating, cooling, commercial" className="bottom-0 left-8 lg:left-4" d={2400} />
          <div className="absolute top-3 right-4 z-10 grid size-14 place-items-center rounded-full bg-primary text-white shadow-lg anim-ring-pulse" aria-hidden><Snowflake className="size-6" /></div>
        </div>
      </div>
    </section>
  );
}
