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
    <li {...reveal(index)} className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-blue-900/10">
      <div className="relative shrink-0 self-start">
        <span className="block size-24 overflow-hidden rounded-xl">
          <img src={service.image} alt="" width={208} height={208} loading="lazy" decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
        </span>
        <span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full bg-primary text-white shadow-md ring-4 ring-white transition-transform duration-300 group-hover:rotate-12" aria-hidden>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base font-bold text-navy">{service.name}</h3>
        <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-600">{service.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
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
