import { ChevronRight, ClipboardList, Handshake, MapPin } from "lucide-react";
import { reveal } from "@/lib/reveal";
import { SectionHeading } from "./SectionHeading";

const steps = [
  { icon: ClipboardList, title: "Tell Us About Your Problem", text: "Choose your HVAC issue and explain what is happening." },
  { icon: MapPin, title: "Share Your Location", text: "Provide your address and contact details so we can understand where service is needed." },
  { icon: Handshake, title: "Get Help Finding a Contractor", text: "We review your request and help connect you with a suitable local contractor when one is available." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="how-title" eyebrow="Getting started" title="Getting HVAC Help Is Simple" text="Follow these easy steps to explore local HVAC options." />
        <ol className="mt-12 grid gap-4 md:grid-cols-3 md:gap-0">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} {...reveal(i)} className="group relative flex md:px-2">
              <div className="flex w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-blue-900/10">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white" aria-hidden><Icon className="size-6" /></span>
                <div>
                  <p className="text-xs font-bold tracking-wider text-primary uppercase">Step {i + 1}</p>
                  <h3 className="mt-0.5 text-base font-bold text-navy">{title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600">{text}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight aria-hidden className="absolute top-1/2 -right-3 z-10 hidden size-6 -translate-y-1/2 rounded-full bg-white text-primary shadow md:block" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
