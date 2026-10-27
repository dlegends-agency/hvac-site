import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/sections/HeroSection";
import { LeadSection } from "@/components/sections/LeadSection";
import { ServiceGrid } from "@/components/sections/ServiceGrid";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { BenefitsSection } from "@/components/sections/BenefitsSection";
import { EmergencySituations } from "@/components/sections/EmergencySituations";
import { ServiceAreaSection } from "@/components/sections/ServiceAreaSection";
import { FAQAccordion } from "@/components/sections/FAQAccordion";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { DirectoryPromo } from "@/components/sections/DirectoryPromo";
import { siteConfig } from "@/config/site";
import { usePageMeta } from "@/lib/use-page-meta";

export default function HomePage() {
  usePageMeta({ title: siteConfig.seo.title, description: siteConfig.seo.description, path: "/" });
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <LeadSection />
        <ServiceGrid />
        <DirectoryPromo />
        <HowItWorks />
        <BenefitsSection />
        <EmergencySituations />
        <ServiceAreaSection />
        <FAQAccordion />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
