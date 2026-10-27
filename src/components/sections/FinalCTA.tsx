import { OpenFormButton } from "@/components/OpenFormButton";

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="bg-navy py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 id="cta-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Need Help With Your Heating or Cooling System?
        </h2>
        <p className="mt-4 text-lg text-blue-100">
          Tell us about your HVAC problem and location. We&apos;ll help you find suitable local repair options.
        </p>
        <div className="mt-8 flex justify-center">
          <OpenFormButton variant="accent" className="px-8 py-4 text-lg">Submit a Service Request</OpenFormButton>
        </div>
      </div>
    </section>
  );
}
