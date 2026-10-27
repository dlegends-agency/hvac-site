import { LoginForm } from "@/components/admin/LoginForm";
import { usePageMeta } from "@/lib/use-page-meta";

export default function AdminLoginPage() {
  usePageMeta({ title: "Admin sign in", noindex: true });
  return (
    <div className="min-h-screen bg-surface">
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <LoginForm />
      </main>
    </div>
  );
}
