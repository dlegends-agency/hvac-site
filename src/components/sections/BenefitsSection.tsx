import { FileText, MapPinned, MessageSquare, Search } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const benefits = [
  { icon: FileText, title: "Simple Request Process", text: "Share your repair needs in one convenient place." },
  { icon: MapPinned, title: "Local Service Focus", text: "Provide your location so we can identify contractors who serve your area." },
  { icon: MessageSquare, title: "Clear Communication", text: "Tell us about your problem and how you prefer to be contacted." },
  { icon: Search, title: "Help Finding Suitable Options", text: "We use the information you provide to help identify an appropriate contractor." },
];

export function BenefitsSection() {
  return (
    <section aria-labelledby="benefits-title" className="bg-gradient-to-b from-white to-sky-50/70 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="benefits-title" title="A Simpler Way to Find HVAC Repair Help" text="One place to describe the problem, share your location and say how you want to be contacted." />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-primary" aria-hidden><Icon className="size-5" /></span>
              <h3 className="mt-3 text-base font-bold text-navy">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
