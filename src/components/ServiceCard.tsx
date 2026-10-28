import { ArrowRight, Building2, Droplets, Fan, Flame, Power, Snowflake, Thermometer, Wrench, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { servicePath } from "@/config/serviceContent";
import type { ServiceCategory, ServiceIcon } from "@/config/services";
import { OpenFormButton } from "@/components/OpenFormButton";
import { reveal } from "@/lib/reveal";

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

export function ServiceCard({ service, index = 0 }: { service: ServiceCategory; index?: number }) {
  const Icon = icons[service.icon];
  return (
    <li {...reveal(index)} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl hover:shadow-blue-900/10">
      <div className="relative overflow-hidden">
        <img src={service.image} alt="" width={800} height={500} loading="lazy" decoding="async"
          className="aspect-[8/5] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        <span className="absolute bottom-3 left-4 grid size-11 place-items-center rounded-full bg-white text-primary shadow-lg ring-1 ring-slate-100 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-6" aria-hidden>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
        <h3 className="text-base font-bold text-navy">{service.name}</h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{service.description}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <OpenFormButton issue={service.issue} variant="link" ariaLabel={`Request help with ${service.name}`}>
            <span className="font-semibold">Find Help Now</span> <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
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
