import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Emergency HVAC Repair",
  robots: { index: false, follow: false },
  alternates: { canonical: undefined },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface">{children}</div>;
}
