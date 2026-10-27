import { Suspense } from "react";
import { LeadDetail } from "@/components/admin/LeadDetail";

export default function AdminLeadPage() {
  return (
    <Suspense fallback={<p className="text-slate-600">Loading…</p>}>
      <LeadDetail />
    </Suspense>
  );
}
