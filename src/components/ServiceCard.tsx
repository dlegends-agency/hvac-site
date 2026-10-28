import { ArrowRight, Building2, Droplets, Fan, Flame, Power, Snowflake, Thermometer, Wrench, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { servicePath } from "@/config/serviceContent";
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
    <li className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-900/10">
      <div className="relative">
        <img src={service.image} alt="" width={532} height={172} loading="lazy" decoding="async" className="h-32 w-full object-cover" />
        <span className="absolute -bottom-5 left-5 grid size-11 place-items-center rounded-full bg-white text-primary shadow-md ring-1 ring-slate-100" aria-hidden>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-8 pb-5">
        <h3 className="text-base font-bold text-navy">{service.name}</h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{service.description}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <OpenFormButton issue={service.issue} variant="link" ariaLabel={`Request help with ${service.name}`}>
            Find Help Now <ArrowRight className="size-3.5" aria-hidden />
          </OpenFormButton>
          {service.pageSlug && (
            <Link to={servicePath(service.pageSlug)} className="text-xs font-medium text-slate-500 hover:text-primary hover:underline">
              Learn more<span className="sr-only"> about {service.name.toLowerCase()}</span>
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
