import { Building2, Droplets, Flame, Snowflake, TriangleAlert, Volume2 } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const situations = [
  { icon: Snowflake, title: "Air conditioning failure during hot weather",
    text: "Indoor heat can build quickly, which is hard on children, older adults, pets and anyone with health conditions. A technician can diagnose why cooling has stopped." },
  { icon: Flame, title: "Furnace failure during cold weather",
    text: "Losing heat in cold conditions affects comfort and can put pipes at risk. Heating equipment should be inspected and repaired by a qualified professional." },
  { icon: Droplets, title: "HVAC system leaking water",
    text: "Leaks can damage floors, ceilings and walls, and may point to a drainage or refrigerant problem that needs professional attention." },
  { icon: Volume2, title: "Unusual noises or system shutdowns",
    text: "Grinding, banging or repeated shutoffs can signal a failing part. Continued running may make the problem worse." },
  { icon: Building2, title: "Commercial heating or cooling failure",
    text: "Offices, shops and other businesses may need to restore comfort quickly for staff, customers or equipment." },
];

export function EmergencySituations() {
  return (
    <section aria-labelledby="situations-title" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="situations-title" title="When Your HVAC System Stops Working"
          text="Common situations where it makes sense to bring in a professional." />
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {situations.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emergency-soft text-emergency" aria-hidden>
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold text-navy">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <aside aria-label="Safety notice" className="mt-8 flex gap-4 rounded-2xl border border-orange-300 bg-emergency-soft p-5">
          <TriangleAlert className="mt-0.5 size-6 shrink-0 text-emergency" aria-hidden />
          <div>
            <p className="font-semibold text-navy">Safety first</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">
              If you suspect a gas leak, carbon monoxide exposure or another immediate hazard, leave the area if it is safe to do so,
              then contact your local emergency service or gas utility from a safe location. Do not wait for a contractor to respond to a request here.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
