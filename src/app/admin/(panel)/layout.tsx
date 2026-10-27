import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-600">Loading…</p>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
