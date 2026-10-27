import { Link } from "react-router-dom";
import { Phone, Wind } from "lucide-react";
import { siteConfig } from "@/config/site";
import { OpenFormButton } from "@/components/OpenFormButton";
import { MobileNavigation } from "@/components/MobileNavigation";
import { buttonClass } from "@/components/ui/Button";

export function Header() {
  const { brand, nav, contact } = siteConfig;
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-navy">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-white" aria-hidden>
            <Wind className="size-5" />
          </span>
          {brand.name}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
          {nav.map((item) => (
            <Link key={item.href} to={item.href} className="text-sm font-medium text-slate-700 hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {contact.phone && contact.phoneHref && (
            <a href={contact.phoneHref} className={buttonClass("secondary", "hidden !py-2 sm:inline-flex")}>
              <Phone className="size-4" aria-hidden /> {contact.phone}
            </a>
          )}
          <OpenFormButton className="!px-4 !py-2 text-sm sm:text-base">Find HVAC Help</OpenFormButton>
          <MobileNavigation items={nav} />
        </div>
      </div>
    </header>
  );
}
