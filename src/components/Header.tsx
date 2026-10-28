import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Phone } from "lucide-react";
import { siteConfig } from "@/config/site";
import { Logo } from "@/components/Logo";
import { OpenFormButton } from "@/components/OpenFormButton";
import { MobileNavigation } from "@/components/MobileNavigation";
import { buttonClass } from "@/components/ui/Button";

export function Header() {
  const { nav, contact } = siteConfig;
  const { pathname, hash } = useLocation();
  const isActive = (href: string) => (href.includes("#") ? pathname === "/" && hash === href.slice(1) : href === "/" ? pathname === "/" && !hash : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-site items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label={`${siteConfig.brand.name} home`}><Logo /></Link>

        <nav aria-label="Primary" className="hidden items-center gap-5 xl:gap-7 lg:flex">
          {nav.map((item) => (
            <Link key={item.href} to={item.href} aria-current={isActive(item.href) ? "page" : undefined}
              className={`border-b-2 py-1 text-[13px] font-semibold whitespace-nowrap transition-colors xl:text-sm ${isActive(item.href) ? "border-primary text-primary" : "border-transparent text-navy hover:text-primary"}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {contact.phone && contact.phoneHref && (
            <a href={contact.phoneHref} className={buttonClass("secondary", "hidden !py-2 sm:inline-flex")}>
              <Phone className="size-4" aria-hidden /> {contact.phone}
            </a>
          )}
          <OpenFormButton ariaLabel="Find HVAC Help" className="!rounded-full !px-4 !py-2.5 text-sm whitespace-nowrap sm:!px-5">
            <span className="sm:hidden">Find Help</span><span className="hidden sm:inline">Find HVAC Help</span> <ArrowRight className="hidden size-4 sm:block" aria-hidden />
          </OpenFormButton>
          <MobileNavigation items={nav} />
        </div>
      </div>
    </header>
  );
}
