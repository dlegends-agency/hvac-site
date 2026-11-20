import { PageTitle } from "@/components/admin/widgets";
import { PerformancePanel } from "./PerformancePanel";

/** How the business listing is doing: views, clicks and requests over the last 30 days. */
export default function ContractorAnalytics() {
  return (
    <>
      <PageTitle title="Analytics" description="How your business listing performed over the last 30 days." />
      <PerformancePanel />
    </>
  );
}
