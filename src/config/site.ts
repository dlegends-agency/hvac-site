export interface NavItem {
  label: string;
  href: string;
}

export interface SiteConfig {
  brand: { name: string; tagline: string; description: string };
  /** Production origin used for canonical URLs. Set NEXT_PUBLIC_SITE_URL. */
  url: string;
  contact: { phone?: string; phoneHref?: string; email?: string; address?: string };
  nav: NavItem[];
  seo: { title: string; description: string };
  /** Leave empty until the page exists; the footer renders plain text for empty hrefs. */
  legal: { privacyHref: string; termsHref: string; contactHref: string };
}

const phone = import.meta.env.VITE_CONTACT_PHONE || undefined;

export const siteConfig: SiteConfig = {
  brand: {
    name: "Emergency HVAC Repair",
    tagline: "Local HVAC contractor referrals",
    description:
      "A referral service that helps people with heating and cooling problems find independent local HVAC contractors, where suitable contractors are available.",
  },
  url: (import.meta.env.VITE_SITE_URL as string | undefined) ?? "http://localhost:3100",
  // Click-to-call is hidden unless a real number is configured.
  contact: {
    phone,
    phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined,
    email: import.meta.env.VITE_CONTACT_EMAIL || undefined,
    address: import.meta.env.VITE_CONTACT_ADDRESS || undefined,
  },
  nav: [
    { label: "Home", href: "/" },
    { label: "HVAC Services", href: "/#services" },
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Service Areas", href: "/#service-areas" },
    { label: "FAQ", href: "/#faq" },
    { label: "Blog", href: "/blog" },
  ],
  seo: {
    title: "Emergency HVAC Repair | Find Local Heating and AC Help",
    description:
      "Need emergency HVAC repair? Tell us about your heating or AC problem and location. We'll help you find suitable local HVAC repair options.",
  },
  legal: { privacyHref: "", termsHref: "", contactHref: "#contact" },
};
