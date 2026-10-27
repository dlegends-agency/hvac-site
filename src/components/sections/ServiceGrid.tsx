import { services } from "@/config/services";
import { ServiceCard } from "@/components/ServiceCard";
import { SectionHeading } from "./SectionHeading";

export function ServiceGrid() {
  return (
    <section id="services" aria-labelledby="services-title" className="bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading id="services-title" title="What HVAC Problem Do You Need Help With?"
          text="Explore common heating and cooling repair needs." />
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => <ServiceCard key={s.id} service={s} />)}
        </ul>
      </div>
    </section>
  );
}
