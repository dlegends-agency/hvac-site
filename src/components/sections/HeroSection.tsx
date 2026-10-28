import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, MapPin, Play, Snowflake, Wrench } from "lucide-react";
import { OpenFormButton } from "@/components/OpenFormButton";
import { buttonClass } from "@/components/ui/Button";

const points = ["Heating and cooling problems", "Residential and commercial", "Takes only a few minutes"];

const floatingCards = [
  { icon: MapPin, title: "Local Contractors", text: "Search by your area" },
  { icon: Building2, title: "Independent Businesses", text: "Not employed by us" },
  { icon: Wrench, title: "Repairs & Installations", text: "Heating, cooling, commercial" },
];

export function HeroSection() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-b from-sky-50 via-sky-50/60 to-white">
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:py-20">
        <div>
          <p className="inline-flex rounded-md bg-orange-100 px-3 py-1 text-xs font-bold tracking-wider text-emergency uppercase">
            Heating &amp; AC help, made simple
          </p>
          <h1 id="hero-title" className="mt-5 text-4xl font-extrabold tracking-tight text-navy sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
            Need Emergency HVAC Repair?
          </h1>
          <p className="mt-4 text-xl font-medium text-navy sm:text-2xl">Find Help From Local HVAC Contractors.</p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Having trouble with your heating or air conditioning system? Tell us what&apos;s happening and where you&apos;re located.
            We&apos;ll help you find a suitable local contractor for your repair needs.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <OpenFormButton className="!rounded-full px-7 py-3.5 text-base">Find HVAC Help <ArrowRight className="size-4" aria-hidden /></OpenFormButton>
            <Link to="/#how-it-works" className={buttonClass("secondary", "!rounded-full px-7 py-3.5 text-base !text-primary")}>
              <Play className="size-4 fill-current" aria-hidden /> How It Works
            </Link>
          </div>
          <p className="mt-5 max-w-xl text-sm text-slate-600">
            One simple request. Your HVAC problem and location. We&apos;ll help you explore suitable local repair options.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {points.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm font-semibold text-navy">
                <span className="grid size-5 place-items-center rounded-full bg-blue-100 text-primary" aria-hidden><Check className="size-3" strokeWidth={3} /></span> {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[2rem] shadow-xl shadow-slate-900/10">
            <img src="/images/hero.jpg" alt="Technician servicing an outdoor air conditioning unit at a home" width={776} height={848}
              fetchPriority="high" decoding="async" className="h-[340px] w-full object-cover object-[55%_85%] sm:h-[420px] lg:h-[460px]" />
          </div>
          <ul className="absolute top-5 right-3 hidden w-52 space-y-2.5 sm:block lg:-right-4">
            {floatingCards.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-3 rounded-xl bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary" aria-hidden><Icon className="size-5" /></span>
                <span className="leading-tight"><span className="block text-sm font-bold text-navy">{title}</span><span className="text-xs text-slate-600">{text}</span></span>
              </li>
            ))}
          </ul>
          <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-2xl bg-white/95 p-3 pr-5 shadow-lg shadow-slate-900/10 backdrop-blur">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-white" aria-hidden><Snowflake className="size-5" /></span>
            <span className="leading-tight"><span className="block text-sm font-bold text-navy">Request Help Today</span><span className="text-xs text-slate-600">We&apos;ll help you look for options</span></span>
          </div>
        </div>
      </div>
    </section>
  );
}
