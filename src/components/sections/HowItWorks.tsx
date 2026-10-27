import { ClipboardList, MapPin, Handshake } from "lucide-react";
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
        <SectionHeading id="how-title" title="Getting HVAC Help Is Simple" />
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full bg-primary text-white" aria-hidden>
                  <Icon className="size-6" />
                </span>
                <span className="text-sm font-semibold text-slate-500">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-navy">{title}</h3>
              <p className="mt-2 text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
