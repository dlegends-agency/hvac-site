import { Building2, Droplets, Fan, Flame, Power, Snowflake, Thermometer, Wrench, type LucideIcon } from "lucide-react";
import type { ServiceCategory, ServiceIcon } from "@/config/services";
import { OpenFormButton } from "@/components/OpenFormButton";

const icons: Record<ServiceIcon, LucideIcon> = {
  snowflake: Snowflake,
  flame: Flame,
  wrench: Wrench,
  fan: Fan,
  power: Power,
  thermometer: Thermometer,
  droplets: Droplets,
  building: Building2,
};

export function ServiceCard({ service }: { service: ServiceCategory }) {
  const Icon = icons[service.icon];
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-primary" aria-hidden>
        <Icon className="size-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-navy">{service.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{service.description}</p>
      <OpenFormButton issue={service.issue} variant="secondary" className="mt-5 !py-2.5 text-sm"
        ariaLabel={`Request help with ${service.name}`}>
        Request Help
      </OpenFormButton>
    </li>
  );
}
