import { Link } from "react-router-dom";
import { siteConfig } from "@/config/site";
import { CopyrightYear } from "@/components/CopyrightYear";
import { services } from "@/config/services";
import { locations, locationPagesPublished } from "@/config/locations";

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  // Pages that don't exist yet render as plain text rather than dead links.
  if (!href) return <span className="text-slate-400">{children}</span>;
  return href.startsWith("#") ? (
    <a href={href} className="hover:text-white">{children}</a>
  ) : (
    <Link to={href} className="hover:text-white">{children}</Link>
  );
}

export function Footer() {
  const { brand, contact, legal } = siteConfig;
  const col = "text-sm font-semibold text-white";
  const list = "mt-3 space-y-2 text-sm text-slate-300";
  return (
    <footer className="bg-navy text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="text-lg font-bold text-white">{brand.name}</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed">
              A referral service that helps connect people with independent local HVAC contractors, where suitable contractors are available.
              We do not perform HVAC repairs ourselves.
            </p>
          </div>
          <nav aria-label="HVAC services">
            <h2 className={col}>HVAC Services</h2>
            <ul className={list}>
              {services.slice(0, 5).map((s) => (
                <li key={s.id}><Link to="/#services" className="hover:text-white">{s.name}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Service areas">
            <h2 className={col}>Service Areas</h2>
            <ul className={list}>
              {locations.map((l) => (
                <li key={l.slug}>
                  {locationPagesPublished ? <FooterLink href={l.path}>{l.name}</FooterLink> : <Link to="/#service-areas" className="hover:text-white">{l.name}</Link>}
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company">
            <h2 className={col}>Company</h2>
            <ul className={list}>
              <li><Link to="/#how-it-works" className="hover:text-white">How It Works</Link></li>
              <li><Link to="/#faq" className="hover:text-white">FAQ</Link></li>
              <li><Link to="/blog" className="hover:text-white">Blog</Link></li>
              <li><FooterLink href={legal.contactHref}>Contact</FooterLink></li>
              <li><FooterLink href={legal.privacyHref}>Privacy Policy</FooterLink></li>
              <li><FooterLink href={legal.termsHref}>Terms of Use</FooterLink></li>
            </ul>
          </nav>
        </div>

        <div id="contact" className="mt-10 border-t border-white/10 pt-6 text-sm">
          <p className="font-semibold text-white">Contact</p>
          {contact.phone || contact.email || contact.address ? (
            <ul className="mt-2 space-y-1">
              {contact.phone && <li>Phone: <a className="hover:text-white" href={contact.phoneHref}>{contact.phone}</a></li>}
              {contact.email && <li>Email: <a className="hover:text-white" href={`mailto:${contact.email}`}>{contact.email}</a></li>}
              {contact.address && <li>{contact.address}</li>}
            </ul>
          ) : (
            <p className="mt-2 text-slate-400">Contact details will be added when they are configured.</p>
          )}
          <p className="mt-6 leading-relaxed text-slate-400">
            <span className="font-semibold text-slate-200">Contractor referral disclosure:</span> {brand.name} is a lead generation and referral
            service. Contractors are independent businesses, not employees or agents of this website. We do not guarantee contractor availability,
            licensing, insurance, pricing, response time or the quality of any work. Confirm credentials directly with any contractor you consider hiring.
          </p>
          <p className="mt-4 text-slate-400">© <CopyrightYear /> {brand.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
