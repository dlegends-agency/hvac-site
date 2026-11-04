import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Phone } from "lucide-react";
import { siteConfig, type NavItem } from "@/config/site";
import { Logo } from "@/components/Logo";
import { OpenFormButton } from "@/components/OpenFormButton";
import { MobileNavigation } from "@/components/MobileNavigation";
import { buttonClass } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useSignedIn } from "@/lib/use-signed-in";

export function Header() {
  const { nav, contact } = siteConfig;
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  // "My Requests" is only for people who are signed in.
  const items: NavItem[] = signedIn ? [...nav, { label: "My Requests", href: "/account" }] : nav;

  async function logout() {
    await getSupabaseBrowser().auth.signOut();
    navigate("/");
  }
  const isActive = (href: string) => (href.includes("#") ? pathname === "/" && hash === href.slice(1) : href === "/" ? pathname === "/" && !hash : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-site items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label={`${siteConfig.brand.name} home`}><Logo /></Link>

        <nav aria-label="Primary" className="hidden items-center gap-5 xl:gap-7 lg:flex">
          {items.map((item) => (
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
          {signedIn ? (
            <button type="button" onClick={logout} className="hidden px-2 text-sm font-semibold text-navy hover:text-primary lg:inline">Logout</button>
          ) : (
            <Link to="/account/login" className="hidden px-2 text-sm font-semibold text-navy hover:text-primary lg:inline">Login</Link>
          )}
          <OpenFormButton ariaLabel="Find HVAC Help" className="!rounded-full !px-4 !py-2.5 text-sm whitespace-nowrap sm:!px-5">
            <span className="sm:hidden">Find Help</span><span className="hidden sm:inline">Find HVAC Help</span> <ArrowRight className="hidden size-4 sm:block" aria-hidden />
          </OpenFormButton>
          <MobileNavigation items={items} signedIn={signedIn} onLogout={logout} />
        </div>
      </div>
    </header>
  );
}
