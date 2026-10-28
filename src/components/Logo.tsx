import { House, Wind } from "lucide-react";
import { siteConfig } from "@/config/site";

/** Brand mark: house icon plus a two-tone wordmark and tagline. The name comes from siteConfig. */
export function Logo({ light = false }: { light?: boolean }) {
  const words = siteConfig.brand.name.split(" ");
  const last = words.pop();
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-9 shrink-0 place-items-center sm:size-10" aria-hidden>
        <House className={`size-9 sm:size-10 ${light ? "text-white" : "text-primary"}`} strokeWidth={1.8} />
        <Wind className={`absolute top-[15px] size-3.5 sm:top-[17px] sm:size-4 ${light ? "text-white" : "text-primary"}`} strokeWidth={2.4} />
      </span>
      <span className="flex flex-col leading-none whitespace-nowrap">
        <span className={`text-[15px] font-extrabold tracking-tight sm:text-xl ${light ? "text-white" : "text-navy"}`}>
          {words.join(" ")} <span className={light ? "text-sky-300" : "text-primary"}>{last}</span>
        </span>
        <span className={`mt-1 hidden text-[9px] font-semibold tracking-[0.18em] uppercase ${light ? "text-slate-300 sm:block" : "text-slate-500 xl:block"}`}>
          {siteConfig.brand.tagline}
        </span>
      </span>
    </span>
  );
}
