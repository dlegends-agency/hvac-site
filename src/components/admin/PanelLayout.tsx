import { Outlet } from "react-router-dom";
import { AdminShell } from "@/components/admin/AdminShell";
import { usePageMeta } from "@/lib/use-page-meta";

export default function PanelLayout() {
  usePageMeta({ title: "Admin | HVACHelp", noindex: true });
  return (
    <div className="min-h-screen bg-surface">
      <AdminShell>
        <Outlet />
      </AdminShell>
    </div>
  );
}
